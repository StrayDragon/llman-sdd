/**
 * Nested chrome copy and per-path viewport keys (studio-web r176).
 */

export function divePillLabel(opts: {
  graphKind?: 'machine' | 'flow';
  subLabel?: string;
  dirty?: boolean;
}): string {
  const raw = opts.subLabel?.trim();
  const base =
    raw !== undefined && raw !== ''
      ? raw
      : opts.graphKind === 'flow'
        ? '进入子流程'
        : '进入子状态机';
  return opts.dirty === true ? `${base} · 已改` : base;
}

export function machineCanvasViewKey(
  machineKey: string,
  nestMachineKeys: readonly string[],
): string {
  if (nestMachineKeys.length === 0) return `machine:${machineKey}`;
  return `machine:${machineKey}|nest:${nestMachineKeys.join(',')}`;
}
