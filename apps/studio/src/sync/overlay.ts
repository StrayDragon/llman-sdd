/**
 * Map sync items onto the live canvas (ours solid, theirs dashed).
 */
import type {
  StudioMachineIR,
  StudioStateNode,
  StudioTransitionEdge,
  SyncItem,
} from '@llman-sdd/core/studio';

export interface SyncCanvasOverlay {
  oursStateNames: string[];
  theirsGhostStates: StudioStateNode[];
  oursEdgeUids: string[];
  theirsGhostEdges: StudioTransitionEdge[];
  focusStateUid: string | null;
  focusEdgeUid: string | null;
}

function findUidByName(machine: StudioMachineIR, name: string): string | undefined {
  return machine.states.find((s) => s.name === name)?.uid;
}

function findEdgeUid(
  machine: StudioMachineIR,
  from: string,
  event: string,
  to: string,
  guard?: string,
): string | undefined {
  const fromUid = findUidByName(machine, from);
  const toUid = findUidByName(machine, to);
  if (fromUid === undefined || toUid === undefined) return undefined;
  return machine.transitions.find(
    (t) =>
      t.fromUid === fromUid &&
      t.toUid === toUid &&
      t.event === event &&
      (t.guard ?? '') === (guard ?? ''),
  )?.uid;
}

export function computeSyncCanvasOverlay(
  machine: StudioMachineIR,
  items: readonly SyncItem[],
  focusItemId: string | null,
): SyncCanvasOverlay {
  const oursStateNames: string[] = [];
  const theirsGhostStates: StudioStateNode[] = [];
  const oursEdgeUids: string[] = [];
  const theirsGhostEdges: StudioTransitionEdge[] = [];
  let focusStateUid: string | null = null;
  let focusEdgeUid: string | null = null;
  let ghostStateSeq = 0;
  let ghostEdgeSeq = 0;

  for (const item of items) {
    if (item.machineKey !== machine.machineKey) continue;
    if (item.kind === 'state') {
      if (item.oursPresent && item.oursStateName) {
        oursStateNames.push(item.oursStateName);
        const uid = findUidByName(machine, item.oursStateName);
        if (focusItemId === item.id && uid) focusStateUid = uid;
      }
      if (item.theirsPresent && item.theirsStateName && !item.oursPresent) {
        ghostStateSeq += 1;
        const ghost: StudioStateNode = {
          uid: `sync-theirs-s${String(ghostStateSeq)}`,
          name: item.theirsStateName,
        };
        theirsGhostStates.push(ghost);
        if (focusItemId === item.id) focusStateUid = ghost.uid;
      }
    }
    if ((item.kind === 'transition' || item.kind === 'guard') && item.oursTransition) {
      const uid = findEdgeUid(
        machine,
        item.oursTransition.from,
        item.oursTransition.event,
        item.oursTransition.to,
        item.oursTransition.guard,
      );
      if (uid) {
        oursEdgeUids.push(uid);
        if (focusItemId === item.id) focusEdgeUid = uid;
      }
    }
    if ((item.kind === 'transition' || item.kind === 'guard') && item.theirsTransition) {
      const already = findEdgeUid(
        machine,
        item.theirsTransition.from,
        item.theirsTransition.event,
        item.theirsTransition.to,
        item.theirsTransition.guard,
      );
      if (already === undefined) {
        ghostEdgeSeq += 1;
        let fromUid = findUidByName(machine, item.theirsTransition.from);
        let toUid = findUidByName(machine, item.theirsTransition.to);
        if (fromUid === undefined) {
          ghostStateSeq += 1;
          fromUid = `sync-theirs-s${String(ghostStateSeq)}`;
          theirsGhostStates.push({ uid: fromUid, name: item.theirsTransition.from });
        }
        if (toUid === undefined) {
          ghostStateSeq += 1;
          toUid = `sync-theirs-s${String(ghostStateSeq)}`;
          theirsGhostStates.push({ uid: toUid, name: item.theirsTransition.to });
        }
        const ghost: StudioTransitionEdge = {
          uid: `sync-theirs-e${String(ghostEdgeSeq)}`,
          fromUid,
          event: item.theirsTransition.event,
          toUid,
          ...(item.theirsTransition.guard ? { guard: item.theirsTransition.guard } : {}),
        };
        theirsGhostEdges.push(ghost);
        if (focusItemId === item.id) focusEdgeUid = ghost.uid;
      }
    }
  }

  return {
    oursStateNames,
    theirsGhostStates,
    oursEdgeUids,
    theirsGhostEdges,
    focusStateUid,
    focusEdgeUid,
  };
}

export function syncItemIsExclusivePick(item: SyncItem): boolean {
  return (
    item.oursPresent &&
    item.theirsPresent &&
    item.oursTransition !== undefined &&
    item.theirsTransition !== undefined
  );
}

export function syncItemAllowsKeepBoth(item: SyncItem): boolean {
  return item.kind === 'state' && item.oursPresent && item.theirsPresent;
}
