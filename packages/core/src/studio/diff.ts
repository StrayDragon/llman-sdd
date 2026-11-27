/**
 * Semantic Diff engine for StudioMachineIR (studio-core r130).
 * Compares baseline vs current strictly by uid — ignores layouts and avoids false edge churn on rename.
 */
import type {
  MachineDraft,
  MachineDraftMode,
  StudioMachineIR,
  StudioStateNode,
  StudioTransitionEdge,
} from './model.ts';

export interface StateRenameDiff {
  uid: string;
  from: string;
  to: string;
}

export type TransitionChangedField = 'from' | 'event' | 'guard' | 'to';

export interface TransitionModifiedDiff {
  uid: string;
  before: StudioTransitionEdge;
  after: StudioTransitionEdge;
  changedFields: TransitionChangedField[];
}

export interface MachineSemanticDiff {
  mode: MachineDraftMode;
  hasChanges: boolean;
  statesAdded: StudioStateNode[];
  statesRemoved: StudioStateNode[];
  statesRenamed: StateRenameDiff[];
  transitionsAdded: StudioTransitionEdge[];
  transitionsRemoved: StudioTransitionEdge[];
  transitionsModified: TransitionModifiedDiff[];
}

export function computeMachineDiff(draft: MachineDraft): MachineSemanticDiff {
  if (draft.mode === 'remove') {
    const base = draft.baseline;
    const statesRemoved = base ? [...base.states] : [];
    const transitionsRemoved = base ? [...base.transitions] : [];
    return {
      mode: 'remove',
      hasChanges: statesRemoved.length > 0 || transitionsRemoved.length > 0 || base !== null,
      statesAdded: [],
      statesRemoved,
      statesRenamed: [],
      transitionsAdded: [],
      transitionsRemoved,
      transitionsModified: [],
    };
  }

  if (draft.mode === 'create' || draft.baseline === null) {
    const cur = draft.current;
    const statesAdded = cur ? [...cur.states] : [];
    const transitionsAdded = cur ? [...cur.transitions] : [];
    return {
      mode: draft.mode,
      hasChanges: statesAdded.length > 0 || transitionsAdded.length > 0,
      statesAdded,
      statesRemoved: [],
      statesRenamed: [],
      transitionsAdded,
      transitionsRemoved: [],
      transitionsModified: [],
    };
  }

  const base = draft.baseline;
  const cur = draft.current;
  if (cur === null) {
    return {
      mode: draft.mode,
      hasChanges: true,
      statesAdded: [],
      statesRemoved: [...base.states],
      statesRenamed: [],
      transitionsAdded: [],
      transitionsRemoved: [...base.transitions],
      transitionsModified: [],
    };
  }

  const baseStates = new Map(base.states.map((s) => [s.uid, s]));
  const curStates = new Map(cur.states.map((s) => [s.uid, s]));
  const baseEdges = new Map(base.transitions.map((t) => [t.uid, t]));
  const curEdges = new Map(cur.transitions.map((t) => [t.uid, t]));

  const statesAdded: StudioStateNode[] = [];
  const statesRemoved: StudioStateNode[] = [];
  const statesRenamed: StateRenameDiff[] = [];
  const transitionsAdded: StudioTransitionEdge[] = [];
  const transitionsRemoved: StudioTransitionEdge[] = [];
  const transitionsModified: TransitionModifiedDiff[] = [];

  for (const s of cur.states) {
    const b = baseStates.get(s.uid);
    if (!b) statesAdded.push(s);
    else if (b.name !== s.name) statesRenamed.push({ uid: s.uid, from: b.name, to: s.name });
  }
  for (const s of base.states) {
    if (!curStates.has(s.uid)) statesRemoved.push(s);
  }

  for (const e of cur.transitions) {
    const b = baseEdges.get(e.uid);
    if (!b) {
      transitionsAdded.push(e);
      continue;
    }
    const changedFields: TransitionChangedField[] = [];
    if (b.fromUid !== e.fromUid) changedFields.push('from');
    if (b.event !== e.event) changedFields.push('event');
    if ((b.guard ?? '') !== (e.guard ?? '')) changedFields.push('guard');
    if (b.toUid !== e.toUid) changedFields.push('to');
    if (changedFields.length > 0) {
      transitionsModified.push({ uid: e.uid, before: b, after: e, changedFields });
    }
  }
  for (const e of base.transitions) {
    if (!curEdges.has(e.uid)) transitionsRemoved.push(e);
  }

  // Semantic edge signature cancellation (studio-web r146):
  // If an edge was deleted and recreated with the exact same (fromUid, event, guard, toUid),
  // cancel the pair to eliminate false -1 / +1 uid churn.
  const edgeSig = (e: StudioTransitionEdge): string =>
    `${e.fromUid}\0${e.event.trim()}\0${(e.guard ?? '').trim()}\0${e.toUid}`;
  const removedBySig = new Map<string, number[]>();
  transitionsRemoved.forEach((e, idx) => {
    const sig = edgeSig(e);
    const list = removedBySig.get(sig) ?? [];
    list.push(idx);
    removedBySig.set(sig, list);
  });
  const cancelledAdded = new Set<number>();
  const cancelledRemoved = new Set<number>();
  transitionsAdded.forEach((e, idx) => {
    const list = removedBySig.get(edgeSig(e));
    if (list && list.length > 0) {
      const remIdx = list.shift();
      if (remIdx !== undefined) {
        cancelledAdded.add(idx);
        cancelledRemoved.add(remIdx);
      }
    }
  });
  const netTransitionsAdded = transitionsAdded.filter((_, idx) => !cancelledAdded.has(idx));
  const netTransitionsRemoved = transitionsRemoved.filter((_, idx) => !cancelledRemoved.has(idx));

  const hasChanges =
    statesAdded.length +
      statesRemoved.length +
      statesRenamed.length +
      netTransitionsAdded.length +
      netTransitionsRemoved.length +
      transitionsModified.length >
    0;

  return {
    mode: draft.mode,
    hasChanges,
    statesAdded,
    statesRemoved,
    statesRenamed,
    transitionsAdded: netTransitionsAdded,
    transitionsRemoved: netTransitionsRemoved,
    transitionsModified,
  };
}

export interface WorldlineOverlayDiff {
  addedStateUids: string[];
  changedStateUids: string[];
  removedStates: StudioStateNode[];
  addedEdgeUids: string[];
  removedEdges: StudioTransitionEdge[];
}

/** Pure 1:1 live canvas overlay diff between two Worldline snapshots (A baseline vs B head). */
export function computeWorldlineOverlayDiff(
  snapshotA: StudioMachineIR | null,
  snapshotB: StudioMachineIR | null,
): WorldlineOverlayDiff {
  const statesA = snapshotA?.states ?? [];
  const statesB = snapshotB?.states ?? [];
  const edgesA = snapshotA?.transitions ?? [];
  const edgesB = snapshotB?.transitions ?? [];

  const aStateMap = new Map(statesA.map((s) => [s.uid, s]));
  const bStateMap = new Map(statesB.map((s) => [s.uid, s]));
  const addedStateUids: string[] = [];
  const changedStateUids: string[] = [];
  const removedStates: StudioStateNode[] = [];

  for (const s of statesB) {
    const prev = aStateMap.get(s.uid);
    if (!prev) addedStateUids.push(s.uid);
    else if (prev.name !== s.name) changedStateUids.push(s.uid);
  }
  for (const s of statesA) {
    if (!bStateMap.has(s.uid)) removedStates.push(s);
  }

  const edgeKey = (e: StudioTransitionEdge): string =>
    `${e.fromUid}\0${e.event.trim()}\0${(e.guard ?? '').trim()}\0${e.toUid}`;
  const aEdgeKeys = new Set(edgesA.map(edgeKey));
  const bEdgeKeys = new Set(edgesB.map(edgeKey));
  const addedEdgeUids = edgesB.filter((e) => !aEdgeKeys.has(edgeKey(e))).map((e) => e.uid);
  const removedEdges = edgesA.filter((e) => !bEdgeKeys.has(edgeKey(e)));

  return { addedStateUids, changedStateUids, removedStates, addedEdgeUids, removedEdges };
}

function resolveStateLabel(
  uid: string,
  primary: StudioMachineIR | null,
  fallback: StudioMachineIR | null,
): string {
  return (
    primary?.states.find((s) => s.uid === uid)?.name ??
    fallback?.states.find((s) => s.uid === uid)?.name ??
    uid
  );
}

/** Render concise `+ / - / ~` semantic diff summary for proposals and prompts. */
export function formatSemanticDiff(diff: MachineSemanticDiff, draft: MachineDraft): string {
  if (!diff.hasChanges) return '# no semantic changes';

  const cur = draft.current;
  const base = draft.baseline;
  const key = cur?.machineKey ?? base?.machineKey ?? draft.sourceFile;

  if (diff.mode === 'remove') {
    return `- [remove machine] ${key}`;
  }

  const lines: string[] = [];
  for (const r of diff.statesRenamed) {
    lines.push(`~ rename state: ${r.from} -> ${r.to}`);
  }
  for (const s of diff.statesAdded) {
    lines.push(`+ add state: ${s.name}`);
  }
  for (const s of diff.statesRemoved) {
    lines.push(`- remove state: ${s.name}`);
  }
  for (const m of diff.transitionsModified) {
    const fromName = resolveStateLabel(m.after.fromUid, cur, base);
    const toName = resolveStateLabel(m.after.toUid, cur, base);
    const details = m.changedFields
      .map((field) => {
        if (field === 'guard')
          return `guard: "${m.before.guard ?? ''}" -> "${m.after.guard ?? ''}"`;
        if (field === 'event') return `event: "${m.before.event}" -> "${m.after.event}"`;
        if (field === 'from') {
          return `from: "${resolveStateLabel(m.before.fromUid, base, cur)}" -> "${fromName}"`;
        }
        return `to: "${resolveStateLabel(m.before.toUid, base, cur)}" -> "${toName}"`;
      })
      .join(', ');
    lines.push(`~ ${fromName} --[${m.after.event}]--> ${toName} (${details})`);
  }
  for (const e of diff.transitionsAdded) {
    const fromName = resolveStateLabel(e.fromUid, cur, base);
    const toName = resolveStateLabel(e.toUid, cur, base);
    const guardPart = e.guard ? ` [${e.guard}]` : '';
    lines.push(`+ ${fromName} --[${e.event}${guardPart}]--> ${toName}`);
  }
  for (const e of diff.transitionsRemoved) {
    const fromName = resolveStateLabel(e.fromUid, base, cur);
    const toName = resolveStateLabel(e.toUid, base, cur);
    const guardPart = e.guard ? ` [${e.guard}]` : '';
    lines.push(`- ${fromName} --[${e.event}${guardPart}]--> ${toName}`);
  }

  return lines.join('\n');
}
