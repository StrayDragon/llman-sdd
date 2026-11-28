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

/** Matches portal layout in StateMachineCanvas (left offset 224, right gap 64, pill 156). */
export const NEST_PORTAL_W = 156;
export const NEST_PORTAL_LEFT = 224;
export const NEST_PORTAL_RIGHT_GAP = 64;
export const NEST_GROUP_PAD = 42;
export const NEST_GROUP_TOP_EXTRA = 56;

export function nestGroupFrameRect(
  inner: { x: number; y: number; w: number; h: number },
  hasIn: boolean,
  hasOut: boolean,
): { x: number; y: number; w: number; h: number } {
  const left = hasIn ? inner.x - NEST_PORTAL_LEFT - NEST_GROUP_PAD : inner.x - NEST_GROUP_PAD;
  const right = hasOut
    ? inner.x + inner.w + NEST_PORTAL_RIGHT_GAP + NEST_PORTAL_W + NEST_GROUP_PAD
    : inner.x + inner.w + NEST_GROUP_PAD;
  const top = inner.y - NEST_GROUP_TOP_EXTRA;
  const bottom = inner.y + inner.h + NEST_GROUP_PAD;
  return { x: left, y: top, w: right - left, h: bottom - top };
}
