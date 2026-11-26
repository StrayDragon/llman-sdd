/**
 * Anchored comments and non-destructive Agent revision proposals (studio-core r131).
 * Agent proposals never mutate human drafts directly; human acceptance applies ops atomically.
 */
import { computeMachineDiff, type MachineSemanticDiff } from './diff.ts';
import {
  cloneMachineDraft,
  cloneMachineIR,
  nextPrefixedUid,
  type MachineDraft,
  type RevisionOp,
  type SemanticAnchor,
  type StudioComment,
  type StudioMachineIR,
  type StudioRevisionProposal,
  type StudioStateDoc,
} from './model.ts';
import { validateMachineGraph, type MachineDiagnostic } from './validate.ts';

export class StudioRevisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioRevisionError';
  }
}

export interface AddCommentInput {
  anchor: SemanticAnchor;
  author: 'human' | 'agent';
  body: string;
  createdAt: string;
  replyTo?: string;
}

export function addStudioComment(doc: StudioStateDoc, input: AddCommentInput): StudioStateDoc {
  const body = input.body.trim();
  if (body === '') throw new StudioRevisionError('comment body must not be empty');
  const id = nextPrefixedUid(
    'c',
    doc.comments.map((c) => c.id),
  );
  const comment: StudioComment = {
    id,
    anchor: input.anchor,
    author: input.author,
    body,
    createdAt: input.createdAt,
    status: 'open',
    ...(input.replyTo !== undefined ? { replyTo: input.replyTo } : {}),
  };
  return {
    ...doc,
    updatedAt: input.createdAt,
    comments: [...doc.comments, comment],
  };
}

export function replyStudioComment(
  doc: StudioStateDoc,
  commentId: string,
  input: { author: 'human' | 'agent'; body: string; createdAt: string; resolve?: boolean },
): StudioStateDoc {
  const target = doc.comments.find((c) => c.id === commentId);
  if (!target) throw new StudioRevisionError(`comment not found: ${commentId}`);
  const added = addStudioComment(doc, {
    anchor: target.anchor,
    author: input.author,
    body: input.body,
    createdAt: input.createdAt,
    replyTo: target.id,
  });
  if (!input.resolve) return added;
  return {
    ...added,
    comments: added.comments.map((c) => (c.id === target.id ? { ...c, status: 'resolved' } : c)),
  };
}

export function resolveStudioComment(
  doc: StudioStateDoc,
  commentId: string,
  updatedAt: string,
): StudioStateDoc {
  const exists = doc.comments.some((c) => c.id === commentId);
  if (!exists) throw new StudioRevisionError(`comment not found: ${commentId}`);
  return {
    ...doc,
    updatedAt,
    comments: doc.comments.map((c) => (c.id === commentId ? { ...c, status: 'resolved' } : c)),
  };
}

export interface ProposeRevisionInput {
  machineKey: string;
  rationale: string;
  ops: RevisionOp[];
  createdAt: string;
  source?: 'agent' | 'drift-trace';
}

export function proposeRevision(doc: StudioStateDoc, input: ProposeRevisionInput): StudioStateDoc {
  if (!doc.machines[input.machineKey]) {
    throw new StudioRevisionError(`machine not found in state doc: ${input.machineKey}`);
  }
  if (input.ops.length === 0) {
    throw new StudioRevisionError('revision proposal must contain at least one op');
  }
  const id = nextPrefixedUid(
    'rev',
    doc.revisions.map((r) => r.id),
  );
  const proposal: StudioRevisionProposal = {
    id,
    machineKey: input.machineKey,
    author: 'agent',
    ...(input.source !== undefined ? { source: input.source } : {}),
    rationale: input.rationale.trim(),
    ops: input.ops.map((op) => ({ ...op })),
    createdAt: input.createdAt,
    status: 'pending',
  };
  return {
    ...doc,
    updatedAt: input.createdAt,
    revisions: [...doc.revisions, proposal],
  };
}

function findStateByName(machine: StudioMachineIR, name: string) {
  const trimmed = name.trim();
  return machine.states.find((s) => s.name === trimmed);
}

/**
 * Purely apply structured RevisionOp[] to a cloned StudioMachineIR.
 * `rename_state` updates the state's name in place while preserving its `uid` and all connected edges.
 */
export function applyRevisionOpsToMachine(
  machine: StudioMachineIR,
  ops: readonly RevisionOp[],
): StudioMachineIR {
  const next = cloneMachineIR(machine);

  for (const op of ops) {
    if (op.op === 'add_state') {
      const name = op.name.trim();
      if (name === '') throw new StudioRevisionError('add_state requires a non-empty name');
      if (!findStateByName(next, name)) {
        const uid = nextPrefixedUid(
          's',
          next.states.map((s) => s.uid),
        );
        next.states.push({ uid, name });
        if (next.initialStateUid === null) next.initialStateUid = uid;
      }
      continue;
    }

    if (op.op === 'rename_state') {
      const target = findStateByName(next, op.from);
      if (!target) {
        throw new StudioRevisionError(`rename_state: state not found: ${op.from}`);
      }
      const newName = op.to.trim();
      if (newName === '') throw new StudioRevisionError('rename_state requires a non-empty `to`');
      target.name = newName;
      continue;
    }

    if (op.op === 'remove_state') {
      const target = findStateByName(next, op.stateName);
      if (!target) {
        throw new StudioRevisionError(`remove_state: state not found: ${op.stateName}`);
      }
      next.states = next.states.filter((s) => s.uid !== target.uid);
      next.transitions = next.transitions.filter(
        (t) => t.fromUid !== target.uid && t.toUid !== target.uid,
      );
      if (next.initialStateUid === target.uid) {
        next.initialStateUid = next.states[0]?.uid ?? null;
      }
      continue;
    }

    if (op.op === 'add_transition') {
      const ensureByName = (rawName: string): string => {
        const trimmed = rawName.trim();
        const found = findStateByName(next, trimmed);
        if (found) return found.uid;
        const uid = nextPrefixedUid(
          's',
          next.states.map((s) => s.uid),
        );
        next.states.push({ uid, name: trimmed });
        return uid;
      };
      const fromUid = ensureByName(op.from);
      const toUid = ensureByName(op.to);
      const uid = nextPrefixedUid(
        'e',
        next.transitions.map((t) => t.uid),
      );
      const guard = op.guard?.trim();
      next.transitions.push({
        uid,
        fromUid,
        event: op.event.trim(),
        ...(guard !== undefined && guard !== '' ? { guard } : {}),
        toUid,
      });
      if (guard !== undefined && guard !== '' && next.columns.guard === undefined) {
        next.columns.guard = next.columns.from === 'from' ? 'guard' : '守卫';
      }
      continue;
    }

    if (op.op === 'remove_transition') {
      const fromSt = findStateByName(next, op.from);
      const toSt = findStateByName(next, op.to);
      if (!fromSt || !toSt) {
        throw new StudioRevisionError(
          `remove_transition: endpoint not found (${op.from} -> ${op.to})`,
        );
      }
      const matchGuard = (op.guard ?? '').trim();
      const idx = next.transitions.findIndex(
        (t) =>
          t.fromUid === fromSt.uid &&
          t.toUid === toSt.uid &&
          t.event === op.event.trim() &&
          (t.guard ?? '').trim() === matchGuard,
      );
      if (idx === -1) {
        throw new StudioRevisionError(
          `remove_transition: transition not found (${op.from} --[${op.event}]--> ${op.to})`,
        );
      }
      next.transitions.splice(idx, 1);
      continue;
    }

    if (op.op === 'update_transition') {
      const fromSt = findStateByName(next, op.match.from);
      const toSt = findStateByName(next, op.match.to);
      if (!fromSt || !toSt) {
        throw new StudioRevisionError(
          `update_transition: match endpoint not found (${op.match.from} -> ${op.match.to})`,
        );
      }
      const matchGuard = (op.match.guard ?? '').trim();
      const edge = next.transitions.find(
        (t) =>
          t.fromUid === fromSt.uid &&
          t.toUid === toSt.uid &&
          t.event === op.match.event.trim() &&
          (t.guard ?? '').trim() === matchGuard,
      );
      if (!edge) {
        throw new StudioRevisionError(
          `update_transition: transition not found (${op.match.from} --[${op.match.event}]--> ${op.match.to})`,
        );
      }
      if (op.next.from !== undefined) {
        const nf = findStateByName(next, op.next.from);
        if (!nf)
          throw new StudioRevisionError(`update_transition: state not found: ${op.next.from}`);
        edge.fromUid = nf.uid;
      }
      if (op.next.to !== undefined) {
        const nt = findStateByName(next, op.next.to);
        if (!nt) throw new StudioRevisionError(`update_transition: state not found: ${op.next.to}`);
        edge.toUid = nt.uid;
      }
      if (op.next.event !== undefined) edge.event = op.next.event.trim();
      if (op.next.guard !== undefined) {
        const ng = op.next.guard.trim();
        if (ng === '') delete edge.guard;
        else {
          edge.guard = ng;
          if (next.columns.guard === undefined) {
            next.columns.guard = next.columns.from === 'from' ? 'guard' : '守卫';
          }
        }
      }
    }
  }

  return next;
}

export interface RevisionPreviewResult {
  machine: StudioMachineIR;
  diffFromCurrent: MachineSemanticDiff;
  diffFromBaseline: MachineSemanticDiff;
  diagnostics: MachineDiagnostic[];
}

/** Preview a revision proposal without modifying the draft. */
export function previewRevisionProposal(
  draft: MachineDraft,
  proposal: StudioRevisionProposal,
): RevisionPreviewResult {
  const baseSource = draft.current ?? draft.baseline;
  if (!baseSource) {
    throw new StudioRevisionError(`cannot preview revision on empty draft: ${proposal.machineKey}`);
  }
  const previewMachine = applyRevisionOpsToMachine(baseSource, proposal.ops);
  const diffFromCurrent = computeMachineDiff({
    mode: 'modify',
    baseline: cloneMachineIR(baseSource),
    current: previewMachine,
    sourceFile: draft.sourceFile,
  });
  const diffFromBaseline = computeMachineDiff({
    ...cloneMachineDraft(draft),
    current: previewMachine,
  });
  const diagnostics = validateMachineGraph(previewMachine);
  return { machine: previewMachine, diffFromCurrent, diffFromBaseline, diagnostics };
}

/** Atomically accept a pending revision proposal into the machine draft and mark it accepted. */
export function acceptRevisionProposal(
  doc: StudioStateDoc,
  revisionId: string,
  acceptedAt: string,
): StudioStateDoc {
  const proposal = doc.revisions.find((r) => r.id === revisionId);
  if (!proposal) throw new StudioRevisionError(`revision not found: ${revisionId}`);
  if (proposal.status !== 'pending') {
    throw new StudioRevisionError(`revision ${revisionId} is already ${proposal.status}`);
  }
  const draft = doc.machines[proposal.machineKey];
  if (!draft || !draft.current) {
    throw new StudioRevisionError(`active machine draft not found: ${proposal.machineKey}`);
  }

  const nextMachine = applyRevisionOpsToMachine(draft.current, proposal.ops);
  const nextDraft: MachineDraft = {
    ...cloneMachineDraft(draft),
    current: nextMachine,
  };

  const existingTl = doc.timelines[proposal.machineKey];
  const nextTimelines = { ...doc.timelines };
  if (existingTl) {
    const truncated = existingTl.entries.slice(0, existingTl.headIdx + 1);
    const seq = truncated.length;
    truncated.push({
      seq,
      id: `#${String(seq)}`,
      label: `accept ${proposal.id}: ${proposal.rationale}`,
      createdAt: acceptedAt,
      isBase: false,
      mode: nextDraft.mode,
      snapshot: cloneMachineIR(nextMachine),
    });
    nextTimelines[proposal.machineKey] = {
      entries: truncated,
      headIdx: truncated.length - 1,
    };
  }

  return {
    ...doc,
    updatedAt: acceptedAt,
    machines: {
      ...doc.machines,
      [proposal.machineKey]: nextDraft,
    },
    timelines: nextTimelines,
    revisions: doc.revisions.map((r) => (r.id === revisionId ? { ...r, status: 'accepted' } : r)),
  };
}

export function rejectRevisionProposal(
  doc: StudioStateDoc,
  revisionId: string,
  rejectedAt: string,
): StudioStateDoc {
  const proposal = doc.revisions.find((r) => r.id === revisionId);
  if (!proposal) throw new StudioRevisionError(`revision not found: ${revisionId}`);
  if (proposal.status !== 'pending') {
    throw new StudioRevisionError(`revision ${revisionId} is already ${proposal.status}`);
  }
  return {
    ...doc,
    updatedAt: rejectedAt,
    revisions: doc.revisions.map((r) => (r.id === revisionId ? { ...r, status: 'rejected' } : r)),
  };
}
