/**
 * Studio pure domain IR and state document models (studio-core r128, r131, r132).
 * Pure types and deterministic helpers — zero filesystem I/O, zero wall-clock calls.
 */

export interface StudioStateNode {
  /** Stable draft-scoped identifier used for rename tracking and edge binding. */
  uid: string;
  /** Business state name written to .feature Examples tables. */
  name: string;
}

export interface StudioTransitionEdge {
  uid: string;
  fromUid: string;
  event: string;
  guard?: string;
  toUid: string;
}

export interface StudioMachineColumns {
  from: string;
  event: string;
  to: string;
  guard?: string;
}

export interface StudioMachineIR {
  machineKey: string;
  capability: string;
  reqId: string | null;
  ruleTitle: string;
  scenarioName: string;
  /** Initial state uid (corresponds to first Examples row's `from`). */
  initialStateUid: string | null;
  /** Preserved column header family (English or Chinese). */
  columns: StudioMachineColumns;
  states: StudioStateNode[];
  transitions: StudioTransitionEdge[];
}

export type MachineDraftMode = 'modify' | 'create' | 'remove';

export interface MachineDraft {
  mode: MachineDraftMode;
  baseline: StudioMachineIR | null;
  current: StudioMachineIR | null;
  /** Instance-relative .feature path (e.g. `llmanspec/specs/order.feature`). */
  sourceFile: string;
}

export type SemanticAnchor =
  | { kind: 'machine'; machineKey: string }
  | { kind: 'state'; machineKey: string; stateUid: string }
  | { kind: 'edge'; machineKey: string; edgeUid: string };

export interface StudioComment {
  id: string;
  anchor: SemanticAnchor;
  author: 'human' | 'agent';
  body: string;
  createdAt: string;
  status: 'open' | 'resolved';
  replyTo?: string;
}

export type RevisionOp =
  | { op: 'add_state'; name: string }
  | { op: 'remove_state'; stateName: string }
  | { op: 'rename_state'; from: string; to: string }
  | { op: 'add_transition'; from: string; event: string; guard?: string; to: string }
  | { op: 'remove_transition'; from: string; event: string; guard?: string; to: string }
  | {
      op: 'update_transition';
      match: { from: string; event: string; guard?: string; to: string };
      next: { from?: string; event?: string; guard?: string; to?: string };
    };

export interface StudioRevisionProposal {
  id: string;
  machineKey: string;
  author: 'agent';
  source?: 'agent' | 'drift-trace';
  rationale: string;
  ops: RevisionOp[];
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface TimelineEntry {
  seq: number;
  id: string;
  label: string;
  createdAt: string;
  isBase: boolean;
  mode: MachineDraftMode;
  snapshot: StudioMachineIR | null;
}

export interface MachineTimeline {
  entries: TimelineEntry[];
  headIdx: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface StudioStateDoc {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  machines: Record<string, MachineDraft>;
  timelines: Record<string, MachineTimeline>;
  /** Cold layout coordinates decoupled from semantic MachineDraft (zero diff noise). */
  layouts: Record<string, Record<string, NodePosition>>;
  comments: StudioComment[];
  revisions: StudioRevisionProposal[];
}

export function makeMachineKey(
  capability: string,
  reqId: string | null,
  scenarioName: string,
): string {
  const reqPart = reqId && reqId.trim() !== '' ? reqId.trim() : 'new';
  return `${capability}/${reqPart}/${scenarioName}`;
}

export function cloneMachineIR(machine: StudioMachineIR): StudioMachineIR {
  return {
    machineKey: machine.machineKey,
    capability: machine.capability,
    reqId: machine.reqId,
    ruleTitle: machine.ruleTitle,
    scenarioName: machine.scenarioName,
    initialStateUid: machine.initialStateUid,
    columns: {
      from: machine.columns.from,
      event: machine.columns.event,
      to: machine.columns.to,
      ...(machine.columns.guard !== undefined ? { guard: machine.columns.guard } : {}),
    },
    states: machine.states.map((s) => ({ uid: s.uid, name: s.name })),
    transitions: machine.transitions.map((t) => ({
      uid: t.uid,
      fromUid: t.fromUid,
      event: t.event,
      ...(t.guard !== undefined ? { guard: t.guard } : {}),
      toUid: t.toUid,
    })),
  };
}

export function cloneMachineDraft(draft: MachineDraft): MachineDraft {
  return {
    mode: draft.mode,
    baseline: draft.baseline ? cloneMachineIR(draft.baseline) : null,
    current: draft.current ? cloneMachineIR(draft.current) : null,
    sourceFile: draft.sourceFile,
  };
}

export function nextPrefixedUid(prefix: string, existingUids: Iterable<string>): string {
  let maxNum = 0;
  for (const uid of existingUids) {
    if (uid.startsWith(prefix)) {
      const rest = uid.slice(prefix.length);
      if (/^\d+$/u.test(rest)) {
        const n = Math.trunc(Number(rest));
        if (n > maxNum) maxNum = n;
      }
    }
  }
  return `${prefix}${String(maxNum + 1)}`;
}
