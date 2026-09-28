import { describe, expect, test } from 'bun:test';

import { buildUnboundFeed, collectUnboundRequirements, parseCapability } from '@llman-sdd/core';

const spec = (cap: string, rules: string, extra = ''): string => `# language: zh-CN
# capability: ${cap}
# purpose: p
# scope: x/

功能: ${cap}
${extra}
${rules}
`;

const BOUND_RULE = `
  @req:r1
  规则: 已绑定
    已绑定描述。

    场景: 验收
      假如 状态
      当 动作
      那么 结果
`;

const BARE_RULE = `
  @req:r2
  规则: 裸
    裸描述。
`;

const SKIP_RULE = `
  @req:r3
  规则: 跳过
    跳过描述。

    @skip
    场景: 跳过场景
      当 动作
      那么 结果
`;

describe('spec unbound feed (r89)', () => {
  const entries = [
    {
      fileName: 'llmanspec/specs/a.feature',
      doc: parseCapability(spec('a', BOUND_RULE + BARE_RULE), 'a.feature'),
    },
    {
      fileName: 'llmanspec/specs/b.feature',
      doc: parseCapability(spec('b', SKIP_RULE), 'b.feature'),
    },
  ];

  test('collects only unbound requirements in deterministic order (file + rule order)', () => {
    const all = collectUnboundRequirements(entries);
    expect(all.map((r) => r.reqId)).toEqual(['r2', 'r3']);
    expect(all[0]).toEqual({
      reqId: 'r2',
      title: '裸',
      statement: '裸描述。',
      capability: 'a',
      featurePath: 'llmanspec/specs/a.feature',
    });
    expect(all[1]?.capability).toBe('b');
  });

  test('default limit is 1 with remaining hint', () => {
    const feed = buildUnboundFeed(entries, 1);
    expect(feed.total).toBe(2);
    expect(feed.returned).toBe(1);
    expect(feed.remaining).toBe(1);
    expect(feed.hint).toContain('--limit 0');
    expect(feed.requirements).toHaveLength(1);
  });

  test('limit 0 returns everything and clears the hint', () => {
    const feed = buildUnboundFeed(entries, 0);
    expect(feed.total).toBe(2);
    expect(feed.returned).toBe(2);
    expect(feed.remaining).toBe(0);
    expect(feed.hint).toBe('');
  });

  test('limit N slices the first N', () => {
    const feed = buildUnboundFeed(entries, 1);
    const feedAll = buildUnboundFeed(entries, 0);
    expect(feed.requirements.map((r) => r.reqId)).toEqual(
      feedAll.requirements.slice(0, 1).map((r) => r.reqId),
    );
  });

  test('all-bound specs yield a zero feed', () => {
    const bound = [
      {
        fileName: 'llmanspec/specs/c.feature',
        doc: parseCapability(spec('c', BOUND_RULE), 'c.feature'),
      },
    ];
    const feed = buildUnboundFeed(bound, 0);
    expect(feed.total).toBe(0);
    expect(feed.returned).toBe(0);
    expect(feed.remaining).toBe(0);
    expect(feed.hint).toBe('');
  });
});
