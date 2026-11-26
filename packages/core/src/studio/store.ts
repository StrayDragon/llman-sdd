/**
 * Local Studio draft storage, Zod validation, and Git-like linear change timeline (studio-core r132).
 * Pure domain module — filesystem and clock access only via injected StudioStateIo.
 */
import { z } from 'zod';

import type { FsPort } from '../util/fsPort.ts';
import {
  cloneMachineDraft,
  cloneMachineIR,
  type MachineDraft,
  type MachineTimeline,
  type StudioMachineIR,
  type StudioStateDoc,
} from './model.ts';

export const STUDIO_STATES_REL = '.llman-sdd/studio/states';

export type StudioStateIo = Pick<
  FsPort,
  | 'exists'
  | 'readText'
  | 'writeText'
  | 'rename'
  | 'listDir'
  | 'mkdirp'
  | 'remove'
  | 'currentPid'
  | 'now'
>;

export class StudioStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioStateError';
  }
}

const STATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export function validateStateId(stateId: string): string {
  const id = stateId.trim();
  if (!STATE_ID_RE.test(id)) {
    throw new StudioStateError(
      `invalid studio state id "${stateId}": must match ${STATE_ID_RE.source} (no path traversal)`,
    );
  }
  return id;
}

export function studioStateRelPath(stateId: string): string {
  return `${STUDIO_STATES_REL}/${validateStateId(stateId)}.json`;
}

const stateNodeSchema = z.object({
  uid: z.string().min(1),
  name: z.string(),
});

const transitionEdgeSchema = z.object({
  uid: z.string().min(1),
  fromUid: z.string().min(1),
  event: z.string(),
  guard: z.string().optional(),
  toUid: z.string().min(1),
});

const columnsSchema = z.object({
  from: z.string().min(1),
  event: z.string().min(1),
  to: z.string().min(1),
  guard: z.string().optional(),
});

const machineIrSchema = z.object({
  machineKey: z.string().min(1),
  capability: z.string().min(1),
  reqId: z.string().nullable(),
  ruleTitle: z.string(),
  scenarioName: z.string().min(1),
  initialStateUid: z.string().nullable(),
  columns: columnsSchema,
  states: z.array(stateNodeSchema),
  transitions: z.array(transitionEdgeSchema),
});

const machineDraftSchema = z.object({
  mode: z.enum(['modify', 'create', 'remove']),
  baseline: machineIrSchema.nullable(),
  current: machineIrSchema.nullable(),
  sourceFile: z.string().min(1),
});

const semanticAnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('machine'), machineKey: z.string().min(1) }),
  z.object({
    kind: z.literal('state'),
    machineKey: z.string().min(1),
    stateUid: z.string().min(1),
  }),
  z.object({ kind: z.literal('edge'), machineKey: z.string().min(1), edgeUid: z.string().min(1) }),
]);

const commentSchema = z.object({
  id: z.string().min(1),
  anchor: semanticAnchorSchema,
  author: z.enum(['human', 'agent']),
  body: z.string().min(1),
  createdAt: z.string().min(1),
  status: z.enum(['open', 'resolved']),
  replyTo: z.string().optional(),
});

const revisionOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_state'), name: z.string() }),
  z.object({ op: z.literal('remove_state'), stateName: z.string() }),
  z.object({ op: z.literal('rename_state'), from: z.string(), to: z.string() }),
  z.object({
    op: z.literal('add_transition'),
    from: z.string(),
    event: z.string(),
    guard: z.string().optional(),
    to: z.string(),
  }),
  z.object({
    op: z.literal('remove_transition'),
    from: z.string(),
    event: z.string(),
    guard: z.string().optional(),
    to: z.string(),
  }),
  z.object({
    op: z.literal('update_transition'),
    match: z.object({
      from: z.string(),
      event: z.string(),
      guard: z.string().optional(),
      to: z.string(),
    }),
    next: z.object({
      from: z.string().optional(),
      event: z.string().optional(),
      guard: z.string().optional(),
      to: z.string().optional(),
    }),
  }),
]);

const revisionProposalSchema = z.object({
  id: z.string().min(1),
  machineKey: z.string().min(1),
  author: z.literal('agent'),
  source: z.enum(['agent', 'drift-trace']).optional(),
  rationale: z.string(),
  ops: z.array(revisionOpSchema),
  createdAt: z.string().min(1),
  status: z.enum(['pending', 'accepted', 'rejected']),
});

const timelineEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  id: z.string().min(1),
  label: z.string(),
  createdAt: z.string().min(1),
  isBase: z.boolean(),
  mode: z.enum(['modify', 'create', 'remove']),
  snapshot: machineIrSchema.nullable(),
});

const timelineSchema = z.object({
  entries: z.array(timelineEntrySchema).min(1),
  headIdx: z.number().int().nonnegative(),
});

const nodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const studioStateDocSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(STATE_ID_RE),
  title: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  machines: z.record(z.string(), machineDraftSchema),
  timelines: z.record(z.string(), timelineSchema),
  layouts: z.record(z.string(), z.record(z.string(), nodePositionSchema)),
  comments: z.array(commentSchema),
  revisions: z.array(revisionProposalSchema),
});

export function buildInitialTimeline(draft: MachineDraft, createdAt: string): MachineTimeline {
  const baseSnapshot = draft.baseline
    ? cloneMachineIR(draft.baseline)
    : draft.current
      ? cloneMachineIR(draft.current)
      : null;
  return {
    entries: [
      {
        seq: 0,
        id: 'BASE',
        label: draft.mode === 'create' ? 'initial create draft' : `${draft.sourceFile} baseline`,
        createdAt,
        isBase: true,
        mode: draft.mode,
        snapshot: baseSnapshot,
      },
    ],
    headIdx: 0,
  };
}

export interface CreateStudioStateDocInput {
  id: string;
  title: string;
  createdAt: string;
  drafts: readonly MachineDraft[];
}

export function createStudioStateDoc(input: CreateStudioStateDocInput): StudioStateDoc {
  const id = validateStateId(input.id);
  const machines: Record<string, MachineDraft> = {};
  const timelines: Record<string, MachineTimeline> = {};
  const layouts: Record<string, Record<string, { x: number; y: number }>> = {};

  for (const draft of input.drafts) {
    const key = draft.current?.machineKey ?? draft.baseline?.machineKey;
    if (!key) continue;
    machines[key] = cloneMachineDraft(draft);
    timelines[key] = buildInitialTimeline(draft, input.createdAt);
    layouts[key] = {};
  }

  return {
    version: 1,
    id,
    title: input.title.trim() || id,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    machines,
    timelines,
    layouts,
    comments: [],
    revisions: [],
  };
}

/**
 * Commit a semantic machine edit onto the Git-like linear timeline.
 * Truncates any future redo entries beyond `headIdx` and advances `headIdx` to the new commit.
 */
export function recordTimelineCommit(
  doc: StudioStateDoc,
  machineKey: string,
  nextMachine: StudioMachineIR | null,
  input: { label: string; createdAt: string; mode?: MachineDraft['mode'] },
): StudioStateDoc {
  const existingDraft = doc.machines[machineKey];
  if (!existingDraft) {
    throw new StudioStateError(`machine not found in state doc: ${machineKey}`);
  }
  const nextMode = input.mode ?? existingDraft.mode;
  const nextDraft: MachineDraft = {
    ...cloneMachineDraft(existingDraft),
    mode: nextMode,
    current: nextMachine ? cloneMachineIR(nextMachine) : null,
  };

  const existingTl =
    doc.timelines[machineKey] ?? buildInitialTimeline(existingDraft, doc.createdAt);
  const entries = existingTl.entries.slice(0, existingTl.headIdx + 1);
  const seq = entries.length;
  entries.push({
    seq,
    id: `#${String(seq)}`,
    label: input.label.trim() || `edit #${String(seq)}`,
    createdAt: input.createdAt,
    isBase: false,
    mode: nextMode,
    snapshot: nextMachine ? cloneMachineIR(nextMachine) : null,
  });

  return {
    ...doc,
    updatedAt: input.createdAt,
    machines: { ...doc.machines, [machineKey]: nextDraft },
    timelines: { ...doc.timelines, [machineKey]: { entries, headIdx: entries.length - 1 } },
  };
}

/** Non-destructive read-only snapshot preview at any timeline index. */
export function previewTimelineEntry(
  doc: StudioStateDoc,
  machineKey: string,
  index: number,
): MachineDraft {
  const draft = doc.machines[machineKey];
  const tl = doc.timelines[machineKey];
  if (!draft || !tl) throw new StudioStateError(`timeline not found for machine: ${machineKey}`);
  const entry = tl.entries[index];
  if (!entry) throw new StudioStateError(`timeline index out of range: ${String(index)}`);
  return {
    mode: entry.mode,
    baseline: draft.baseline ? cloneMachineIR(draft.baseline) : null,
    current: entry.snapshot ? cloneMachineIR(entry.snapshot) : null,
    sourceFile: draft.sourceFile,
  };
}

function stepTimeline(
  doc: StudioStateDoc,
  machineKey: string,
  delta: -1 | 1,
  updatedAt: string,
): StudioStateDoc {
  const draft = doc.machines[machineKey];
  const tl = doc.timelines[machineKey];
  if (!draft || !tl) throw new StudioStateError(`timeline not found for machine: ${machineKey}`);
  const nextIdx = tl.headIdx + delta;
  const target = tl.entries[nextIdx];
  if (!target) return doc;
  const nextDraft: MachineDraft = {
    ...cloneMachineDraft(draft),
    mode: target.mode,
    current: target.snapshot ? cloneMachineIR(target.snapshot) : null,
  };
  return {
    ...doc,
    updatedAt,
    machines: { ...doc.machines, [machineKey]: nextDraft },
    timelines: { ...doc.timelines, [machineKey]: { ...tl, headIdx: nextIdx } },
  };
}

export function undoTimeline(
  doc: StudioStateDoc,
  machineKey: string,
  updatedAt: string,
): StudioStateDoc {
  return stepTimeline(doc, machineKey, -1, updatedAt);
}

export function redoTimeline(
  doc: StudioStateDoc,
  machineKey: string,
  updatedAt: string,
): StudioStateDoc {
  return stepTimeline(doc, machineKey, 1, updatedAt);
}

/**
 * Roll back a machine draft to any historical checkpoint (or index 0 to restore BASE).
 * Rolling back to index 0 resets `headIdx = 0`; rolling back to a non-base checkpoint appends a rollback commit.
 */
export function rollbackTimeline(
  doc: StudioStateDoc,
  machineKey: string,
  targetIdx: number,
  rolledBackAt: string,
): StudioStateDoc {
  const draft = doc.machines[machineKey];
  const tl = doc.timelines[machineKey];
  if (!draft || !tl) throw new StudioStateError(`timeline not found for machine: ${machineKey}`);
  const target = tl.entries[targetIdx];
  if (!target) throw new StudioStateError(`timeline index out of range: ${String(targetIdx)}`);

  if (targetIdx === 0) {
    const baseDraft: MachineDraft = {
      ...cloneMachineDraft(draft),
      mode: target.mode,
      current: target.snapshot ? cloneMachineIR(target.snapshot) : null,
    };
    return {
      ...doc,
      updatedAt: rolledBackAt,
      machines: { ...doc.machines, [machineKey]: baseDraft },
      timelines: { ...doc.timelines, [machineKey]: { ...tl, headIdx: 0 } },
    };
  }

  return recordTimelineCommit(doc, machineKey, target.snapshot, {
    label: `rollback to ${target.id} (${target.label})`,
    createdAt: rolledBackAt,
    mode: target.mode,
  });
}

export function parseStudioStateDoc(rawJson: string): StudioStateDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new StudioStateError(
      `invalid studio state JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const checked = studioStateDocSchema.safeParse(parsed);
  if (!checked.success) {
    const first = checked.error.issues[0];
    throw new StudioStateError(
      `invalid studio state schema at ${first?.path.join('.') || '<root>'}: ${first?.message ?? 'unknown error'}`,
    );
  }
  return checked.data as StudioStateDoc;
}

export function readStudioState(io: StudioStateIo, stateId: string): StudioStateDoc {
  const rel = studioStateRelPath(stateId);
  if (!io.exists(rel)) {
    throw new StudioStateError(`studio state not found: ${stateId}`);
  }
  return parseStudioStateDoc(io.readText(rel));
}

let writeSeq = 0;

/**
 * Atomically persist a StudioStateDoc via sibling `.tmp.<pid>.<seq>` + `rename`.
 * Lazily creates `.llman-sdd/studio/states/` only on write.
 */
export function writeStudioState(io: StudioStateIo, doc: StudioStateDoc): string {
  const checked = studioStateDocSchema.safeParse(doc);
  if (!checked.success) {
    const first = checked.error.issues[0];
    throw new StudioStateError(
      `refusing to write invalid studio state at ${first?.path.join('.') || '<root>'}: ${first?.message ?? 'unknown error'}`,
    );
  }
  const targetRel = studioStateRelPath(doc.id);
  io.mkdirp(STUDIO_STATES_REL);
  writeSeq += 1;
  const tmpRel = `${STUDIO_STATES_REL}/.${doc.id}.tmp.${String(io.currentPid())}.${String(writeSeq)}`;
  io.writeText(tmpRel, `${JSON.stringify(doc, null, 2)}\n`);
  io.rename(tmpRel, targetRel);
  return targetRel;
}

export interface StudioStateSummary {
  id: string;
  title: string;
  machineCount: number;
  updatedAt: string;
}

export function listStudioStates(io: StudioStateIo): StudioStateSummary[] {
  if (!io.exists(STUDIO_STATES_REL)) return [];
  const names = io.listDir(STUDIO_STATES_REL);
  const summaries: StudioStateSummary[] = [];
  for (const name of names.toSorted()) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const id = name.slice(0, -'.json'.length);
    if (!STATE_ID_RE.test(id)) continue;
    const doc = readStudioState(io, id);
    summaries.push({
      id: doc.id,
      title: doc.title,
      machineCount: Object.keys(doc.machines).length,
      updatedAt: doc.updatedAt,
    });
  }
  return summaries;
}

export function deleteStudioState(io: StudioStateIo, stateId: string): boolean {
  const rel = studioStateRelPath(stateId);
  if (!io.exists(rel)) return false;
  io.remove(rel);
  return true;
}
