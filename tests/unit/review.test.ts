import { describe, expect, test } from 'bun:test';

import { buildReview } from '@llman-sdd/core';
import { parseCapability } from '@llman-sdd/core';

const SPEC = (cap: string, req: string, extraTags = ''): string => `# language: zh-CN
# capability: ${cap}
# purpose: p
# scope: x/

功能: ${cap}

  @req:${req} @human${extraTags}
  场景: 规则
    - 系统 MUST x

  @req:${req} @executable
  场景: 验收
    假如 状态
    当 动作
    那么 结果
`;

const UNBOUND_SPEC = `# language: zh-CN
# capability: loose
# purpose: p
# scope: x/

功能: loose

  @req:r9 @human
  场景: 规则
    - 系统 MUST y

  @executable
  场景: 孤儿验收
    假如 状态
    当 动作
    那么 结果
`;

describe('buildReview', () => {
  const io = { exists: () => true };

  test('fully bound spec: zero pending/unbound, exit 0', () => {
    const entries = [{ fileName: 'a.feature', doc: parseCapability(SPEC('a', 'r1'), 'a.feature') }];
    const result = buildReview(
      { entries, bindings: [{ kind: 'tags', tags: ['executable'] }], boundChangeCount: 2 },
      io,
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary.criticalCount).toBe(0);
    const pendingA = result.signals.find((s) => s.kind === 'pending' && s.capability === 'a');
    expect(pendingA?.count).toBe(0);
    // locked 信号:count 恒 0(v1 的锁定确认概念已移除),detail 带绑定数
    const locked = result.signals.find((s) => s.kind === 'locked');
    expect(locked?.count).toBe(0);
    expect(locked?.detail).toInclude('2 bound change(s)');
  });

  test('unbound acceptance (no matching tag) counts as unbound warning', () => {
    const entries = [{ fileName: 'l.feature', doc: parseCapability(UNBOUND_SPEC, 'l.feature') }];
    // bindings 要求 @bdd 标签 → 仅带 @executable 的场景不满足判据
    const result = buildReview(
      { entries, bindings: [{ kind: 'tags', tags: ['bdd'] }], boundChangeCount: 0 },
      io,
    );
    const unbound = result.signals.find((s) => s.kind === 'unbound' && s.capability === 'loose');
    expect(unbound?.count).toBe(1);
    expect(result.summary.warningCount).toBe(2); // pending r9 + unbound 1
  });

  test('validate sweep failure is critical and drives exit code', () => {
    const broken = `功能: broken\n\n  @req:r1 @human\n  场景: 缺头\n    - 系统 MUST x\n`;
    const entries = [
      { fileName: 'broken.feature', doc: parseCapability(broken, 'broken.feature') },
    ];
    const result = buildReview(
      { entries, bindings: [{ kind: 'tags', tags: ['executable'] }], boundChangeCount: 0 },
      io,
    );
    expect(result.summary.criticalCount).toBeGreaterThan(0);
    expect(result.exitCode).toBe(1);
  });

  test('sweep-only failure: validate detail points at llman-sdd validate --all', () => {
    const broken = `功能: broken\n\n  @req:r1 @human\n  场景: 缺头\n    - 系统 MUST x\n`;
    const entries = [
      { fileName: 'broken.feature', doc: parseCapability(broken, 'broken.feature') },
    ];
    const result = buildReview(
      { entries, bindings: [{ kind: 'tags', tags: ['executable'] }], boundChangeCount: 0 },
      io,
    );
    const validate = result.signals.find((s) => s.kind === 'validate');
    expect(validate?.detail).toInclude('llman-sdd validate --all');
    expect(validate?.detail).not.toInclude('unchecked');
  });

  test('strict-only failure (unchecked tasks): detail names the change, no misleading sweep hint', () => {
    const entries = [{ fileName: 'a.feature', doc: parseCapability(SPEC('a', 'r1'), 'a.feature') }];
    const result = buildReview(
      {
        entries,
        bindings: [{ kind: 'tags', tags: ['executable'] }],
        boundChangeCount: 0,
        activeChanges: [{ name: 'c1-do-stuff', completedTasks: 2, totalTasks: 5 }],
      },
      io,
    );
    expect(result.summary.criticalCount).toBe(1);
    expect(result.exitCode).toBe(1);
    const validate = result.signals.find((s) => s.kind === 'validate');
    expect(validate?.count).toBe(1);
    expect(validate?.detail).toInclude('c1-do-stuff (3 unchecked)');
    expect(validate?.detail).not.toInclude('validate --all failed');
  });

  test('sweep + strict failures: detail reports both sources', () => {
    const broken = `功能: broken\n\n  @req:r1 @human\n  场景: 缺头\n    - 系统 MUST x\n`;
    const entries = [
      { fileName: 'broken.feature', doc: parseCapability(broken, 'broken.feature') },
    ];
    const result = buildReview(
      {
        entries,
        bindings: [{ kind: 'tags', tags: ['executable'] }],
        boundChangeCount: 0,
        activeChanges: [{ name: 'c2-half-done', completedTasks: 0, totalTasks: 4 }],
      },
      io,
    );
    const validate = result.signals.find((s) => s.kind === 'validate');
    expect(validate?.count).toBe(2);
    expect(validate?.detail).toInclude('validate --all failed');
    expect(validate?.detail).toInclude('c2-half-done (4 unchecked)');
  });

  test('locked detail uses the v2 command name', () => {
    const entries = [{ fileName: 'a.feature', doc: parseCapability(SPEC('a', 'r1'), 'a.feature') }];
    const result = buildReview(
      { entries, bindings: [{ kind: 'tags', tags: ['executable'] }], boundChangeCount: 1 },
      io,
    );
    const locked = result.signals.find((s) => s.kind === 'locked');
    expect(locked?.detail).toInclude('`llman-sdd change diff <id>`');
  });

  test('text lines follow the v1 layout', () => {
    const entries = [{ fileName: 'a.feature', doc: parseCapability(SPEC('a', 'r1'), 'a.feature') }];
    const result = buildReview(
      { entries, bindings: [{ kind: 'tags', tags: ['executable'] }], boundChangeCount: 0 },
      io,
    );
    expect(result.lines[0]).toBe('Review: critical=0 warning=0');
    expect(result.lines).toContain('pending: a (0)');
    expect(result.lines).toContain('stale: a (0)');
    expect(result.lines.some((l) => l.startsWith('locked: - ('))).toBe(true);
    expect(result.lines.some((l) => l.startsWith('validate: - (0)'))).toBe(true);
  });
});

describe('buildReview --capability filter (r33)', () => {
  const io = { exists: () => true };
  const twoCaps = [
    { fileName: 'a.feature', doc: parseCapability(SPEC('a', 'r1'), 'a.feature') },
    { fileName: 'b.feature', doc: parseCapability(SPEC('b', 'r2'), 'b.feature') },
  ];

  test('restricts per-capability signals to the chosen capability', () => {
    const result = buildReview(
      {
        entries: twoCaps,
        bindings: [{ kind: 'tags', tags: ['executable'] }],
        boundChangeCount: 0,
        capability: 'a',
      },
      io,
    );
    const perCap = result.signals.filter((s) => s.kind !== 'locked' && s.kind !== 'validate');
    expect(perCap.length).toBeGreaterThan(0);
    expect(perCap.every((s) => s.capability === 'a')).toBe(true);
    // locked / validate 保持全局口径
    expect(result.signals.some((s) => s.kind === 'locked')).toBe(true);
    expect(result.signals.some((s) => s.kind === 'validate')).toBe(true);
  });

  test('no capability keeps full signals', () => {
    const result = buildReview(
      { entries: twoCaps, bindings: [{ kind: 'tags', tags: ['executable'] }], boundChangeCount: 0 },
      io,
    );
    const caps = new Set(
      result.signals
        .filter((s) => s.kind !== 'locked' && s.kind !== 'validate')
        .map((s) => s.capability),
    );
    expect(caps.has('a')).toBe(true);
    expect(caps.has('b')).toBe(true);
  });
});
