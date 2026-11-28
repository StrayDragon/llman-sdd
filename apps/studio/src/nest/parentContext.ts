/**
 * Parent-layer neighbor portals from nestStack path (DAG-safe: no parentMachineId).
 */
import type { StudioMachineIR } from '@llman-sdd/core/studio';

export interface NestStepLike {
  machineKey: string;
  label: string;
}

export interface ParentNeighbor {
  uid: string;
  name: string;
  edgeLabel: string;
  dir: 'in' | 'out';
}

export interface ParentNestContext {
  parentIdx: number;
  parentMachineKey: string;
  parentLabel: string;
  hostUid: string;
  hostName: string;
  incoming: ParentNeighbor[];
  outgoing: ParentNeighbor[];
}

function edgeLabel(event: string, guard?: string): string {
  return guard !== undefined && guard !== '' ? `${event} [${guard}]` : event;
}

export function currentMachineKey(tabRootKey: string, nestStack: readonly NestStepLike[]): string {
  return nestStack.at(-1)?.machineKey ?? tabRootKey;
}

export function nestBreadcrumb(
  tabRootKey: string,
  tabRootLabel: string,
  nestStack: readonly NestStepLike[],
): Array<{ machineKey: string; label: string; idx: number }> {
  return [
    { machineKey: tabRootKey, label: tabRootLabel, idx: -1 },
    ...nestStack.map((step, i) => ({ machineKey: step.machineKey, label: step.label, idx: i })),
  ];
}

export function getParentNestContext(
  nestStack: readonly NestStepLike[],
  tabRootKey: string,
  tabRootLabel: string,
  resolve: (machineKey: string) => StudioMachineIR | null | undefined,
): ParentNestContext | null {
  if (nestStack.length === 0) return null;
  const currentKey = nestStack.at(-1)!.machineKey;
  const parentIdx = nestStack.length - 2;
  const parentKey = parentIdx < 0 ? tabRootKey : nestStack[parentIdx]!.machineKey;
  const parentLabel = parentIdx < 0 ? tabRootLabel : nestStack[parentIdx]!.label;
  const parent = resolve(parentKey);
  if (!parent) return null;
  const host = parent.states.find((s) => s.subMachineKey === currentKey);
  if (!host) return null;
  const incoming: ParentNeighbor[] = [];
  const outgoing: ParentNeighbor[] = [];
  for (const edge of parent.transitions) {
    if (edge.toUid === host.uid && edge.fromUid !== host.uid) {
      const src = parent.states.find((s) => s.uid === edge.fromUid);
      if (src) {
        incoming.push({
          uid: src.uid,
          name: src.name,
          edgeLabel: edgeLabel(edge.event, edge.guard),
          dir: 'in',
        });
      }
    }
    if (edge.fromUid === host.uid && edge.toUid !== host.uid) {
      const dst = parent.states.find((s) => s.uid === edge.toUid);
      if (dst) {
        outgoing.push({
          uid: dst.uid,
          name: dst.name,
          edgeLabel: edgeLabel(edge.event, edge.guard),
          dir: 'out',
        });
      }
    }
  }
  return {
    parentIdx,
    parentMachineKey: parentKey,
    parentLabel,
    hostUid: host.uid,
    hostName: host.name,
    incoming,
    outgoing,
  };
}

export function defaultHostFocusUid(
  nestStack: readonly NestStepLike[],
  nextIdx: number,
  tabRootKey: string,
  resolve: (machineKey: string) => StudioMachineIR | null | undefined,
): string | null {
  if (nestStack.length === 0) return null;
  const steppingUpOne = nextIdx === nestStack.length - 2;
  if (!steppingUpOne) return null;
  const leavingKey = nestStack.at(-1)!.machineKey;
  const parentKey = nextIdx < 0 ? tabRootKey : nestStack[nextIdx]!.machineKey;
  const parent = resolve(parentKey);
  return parent?.states.find((s) => s.subMachineKey === leavingKey)?.uid ?? null;
}
