import { expect, test } from 'bun:test';

import {
  divePillLabel,
  machineCanvasViewKey,
  nestFrameCrumbItems,
  nestGroupFrameRect,
  nestStepDisplayLabel,
} from '../../../apps/studio/src/nest/chrome.ts';

test('divePillLabel defaults by graph dialect and optional subLabel', () => {
  expect(divePillLabel({})).toBe('进入子状态机');
  expect(divePillLabel({ dirty: true })).toBe('进入子状态机 · 已改');
  expect(divePillLabel({ graphKind: 'flow' })).toBe('进入子流程');
  expect(divePillLabel({ graphKind: 'flow', dirty: true })).toBe('进入子流程 · 已改');
  expect(divePillLabel({ subLabel: '打开复核子状态机', graphKind: 'flow' })).toBe(
    '打开复核子状态机',
  );
});

test('machineCanvasViewKey includes nest path so DAG entries do not share viewports', () => {
  expect(machineCanvasViewKey('child', [])).toBe('machine:child');
  const viaA = machineCanvasViewKey('child', ['hostA', 'child']);
  const viaB = machineCanvasViewKey('child', ['hostB', 'child']);
  expect(viaA).not.toBe(viaB);
  expect(viaA).toContain('nest:hostA,child');
});

test('nestFrameCrumbItems is root plus every nest layer with only last current', () => {
  const items = nestFrameCrumbItems(
    'root',
    'sdd-pipeline',
    [
      { machineKey: 'mid', label: '实施' },
      { machineKey: 'leaf', label: '门禁' },
    ],
    (key) =>
      key === 'leaf'
        ? { ruleTitle: '运行全量门禁', graphKind: 'flow' }
        : key === 'mid'
          ? { ruleTitle: '实施与验证', graphKind: 'flow' }
          : { ruleTitle: 'sdd-pipeline' },
  );
  expect(items.map((c) => c.label)).toEqual([
    'sdd-pipeline',
    '实施与验证 (子流程)',
    '运行全量门禁 (子流程)',
  ]);
  expect(items.map((c) => c.current)).toEqual([false, false, true]);
  expect(items[0]?.idx).toBe(-1);
  expect(nestStepDisplayLabel({ graphKind: 'flow', ruleTitle: '已含子流程' }, 'x')).toBe(
    '已含子流程',
  );
});

test('nestGroupFrameRect wraps inner box and portal occupancy', () => {
  const inner = { x: 200, y: 100, w: 400, h: 300 };
  const both = nestGroupFrameRect(inner, true, true);
  expect(both.x).toBeLessThan(inner.x);
  expect(both.y).toBeLessThan(inner.y);
  expect(both.x + both.w).toBeGreaterThan(inner.x + inner.w);
  expect(both.y + both.h).toBeGreaterThan(inner.y + inner.h);
  const none = nestGroupFrameRect(inner, false, false);
  expect(none.x).toBeGreaterThan(both.x);
  expect(none.x + none.w).toBeLessThan(both.x + both.w);
});
