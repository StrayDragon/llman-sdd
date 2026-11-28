import { expect, test } from 'bun:test';

import { divePillLabel, machineCanvasViewKey } from '../../../apps/studio/src/nest/chrome.ts';

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
