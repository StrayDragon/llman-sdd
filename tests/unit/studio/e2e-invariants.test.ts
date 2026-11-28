import { describe, expect, test } from 'bun:test';

import {
  ALL_STUDIO_INVARIANTS,
  buildCleanSnapshot,
  buildViolatingSnapshot,
  checkCopyHygiene,
  checkStudioInvariants,
  emptySnapshot,
} from '../../e2e/studio/invariants.ts';

describe('studio e2e pure geometry judge (r156)', () => {
  test('clean snapshot yields zero violations', () => {
    expect(checkStudioInvariants(buildCleanSnapshot())).toEqual([]);
  });

  test('violating snapshot hits all 6 invariants', () => {
    const hit = new Set(checkStudioInvariants(buildViolatingSnapshot()).map((v) => v.invariant));
    for (const id of ALL_STUDIO_INVARIANTS) expect(hit.has(id)).toBe(true);
  });

  test('copy hygiene ignores monochrome glyphs used by production chrome', () => {
    const s = { ...emptySnapshot(), chromeText: '‹ › ↶ ↷ ⌘K ✓ · → ← 主视图' };
    expect(checkCopyHygiene(s)).toEqual([]);
  });

  test('copy hygiene flags DEMO-SIM and VS16 emoji', () => {
    const s = { ...emptySnapshot(), chromeText: '[DEMO-SIM] 触发 ❤️' };
    expect(checkCopyHygiene(s).length).toBe(2);
  });
});
