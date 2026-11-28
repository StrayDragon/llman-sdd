/**
 * Subtree aggregation over StudioMachineIR (visited-set cycle guard).
 * Pure: no store, no I/O.
 */
import type { MachineDraft, StudioMachineIR } from '@llman-sdd/core/studio';
import { computeMachineDiff, formatSemanticDiff } from '@llman-sdd/core/studio';

export function getSubtreeMachineIds(
  rootId: string,
  resolve: (machineKey: string) => StudioMachineIR | null | undefined,
  visited: Set<string> = new Set(),
): string[] {
  if (rootId === '' || visited.has(rootId)) return [];
  const machine = resolve(rootId);
  if (!machine) return [];
  visited.add(rootId);
  const ids = [rootId];
  for (const state of machine.states) {
    const sub = state.subMachineKey;
    if (sub) ids.push(...getSubtreeMachineIds(sub, resolve, visited));
  }
  return ids;
}

export function hasSubtreeChanges(
  rootId: string,
  drafts: Record<string, MachineDraft | undefined>,
): boolean {
  const resolve = (key: string) => drafts[key]?.current ?? drafts[key]?.baseline ?? null;
  return getSubtreeMachineIds(rootId, resolve).some((id) => {
    const draft = drafts[id];
    return draft ? computeMachineDiff(draft).hasChanges : false;
  });
}

export function buildSubtreeDiffText(
  rootId: string,
  drafts: Record<string, MachineDraft | undefined>,
): string {
  const resolve = (key: string) => drafts[key]?.current ?? drafts[key]?.baseline ?? null;
  const ids = getSubtreeMachineIds(rootId, resolve);
  const parts: string[] = [];
  for (const id of ids) {
    const draft = drafts[id];
    if (!draft) continue;
    const diff = computeMachineDiff(draft);
    if (!diff.hasChanges) continue;
    const hdr = id === rootId ? '' : `# [子层: ${id}]\n`;
    parts.push(`${hdr}${formatSemanticDiff(diff, draft)}`);
  }
  return parts.length > 0 ? parts.join('\n\n') : '';
}

export function machineFromDrafts(
  drafts: Record<string, MachineDraft | undefined>,
  key: string,
): StudioMachineIR | null {
  return drafts[key]?.current ?? drafts[key]?.baseline ?? null;
}
