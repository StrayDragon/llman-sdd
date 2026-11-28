/**
 * Nested chrome copy and per-path viewport keys (studio-web r176).
 */
import { nestBreadcrumb, type NestStepLike } from './parentContext.ts';

export interface NestLabelSource {
  ruleTitle?: string;
  scenarioName?: string;
  capability?: string;
  graphKind?: 'machine' | 'flow';
}

export interface NestFrameCrumbItem {
  machineKey: string;
  label: string;
  idx: number;
  current: boolean;
}

export function nestStepDisplayLabel(
  ir: NestLabelSource | null | undefined,
  fallback: string,
): string {
  const base =
    ir?.ruleTitle?.trim() || ir?.scenarioName?.trim() || ir?.capability?.trim() || fallback.trim();
  const name = base === '' ? fallback : base;
  if (ir?.graphKind === 'flow' && !name.includes('子流程')) return `${name} (子流程)`;
  return name;
}

export function nestFrameCrumbItems(
  tabRootKey: string,
  tabRootLabel: string,
  nestStack: readonly NestStepLike[],
  resolve?: (machineKey: string) => NestLabelSource | null | undefined,
): NestFrameCrumbItem[] {
  const crumbs = nestBreadcrumb(tabRootKey, tabRootLabel, nestStack);
  return crumbs.map((c, i) => ({
    machineKey: c.machineKey,
    label: nestStepDisplayLabel(resolve?.(c.machineKey), c.label === '' ? c.machineKey : c.label),
    idx: c.idx,
    current: i === crumbs.length - 1,
  }));
}

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
