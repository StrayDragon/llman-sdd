import { describe, expect, test } from 'bun:test';

import {
  addReq,
  addScenario,
  buildReqRegistry,
  localeToGherkinLang,
  parseCapability,
  planDedupe,
  resolveReq,
} from '@llman-sdd/core';

const HUMAN_RULE = (req: string, capability = 'sample') => `# language: zh-CN
# capability: ${capability}
# purpose: 测试用途
# scope: x/

功能: ${capability}

  @req:${req} @human
  场景: 规则样例
    - 系统 MUST 提供某能力
`;

describe('localeToGherkinLang', () => {
  test('zh-Hans maps to zh-CN, others pass through', () => {
    expect(localeToGherkinLang('zh-Hans')).toBe('zh-CN');
    expect(localeToGherkinLang('en')).toBe('en');
  });
});

describe('parseCapability', () => {
  test('parses zh-CN keywords via fallback chain (no header language)', () => {
    const doc = parseCapability(HUMAN_RULE('r1').replace('# language: zh-CN\n', ''));
    expect(doc.featureName).toBe('sample');
    expect(doc.scenarios).toHaveLength(1);
    expect(doc.scenarios[0]?.classification).toBe('human');
    expect(doc.scenarios[0]?.reqIds).toEqual(['r1']);
    expect(doc.errors).toHaveLength(0);
  });

  test('executable scenario keeps steps; human keeps description statement', () => {
    const src = `${HUMAN_RULE('r1')}
  @req:r1 @executable
  场景: 验收样例
    假如 一个初始状态
    当 一个动作
    那么 一个结果
`;
    const doc = parseCapability(src);
    const rule = doc.scenarios.find((s) => s.classification === 'human');
    const acc = doc.scenarios.find((s) => s.classification === 'executable');
    expect(rule?.statement).toInclude('MUST');
    expect(rule?.stepCount).toBe(0);
    expect(acc?.stepCount).toBe(3);
    expect(doc.errors).toHaveLength(0);
  });

  test('missing header comments are reported per key', () => {
    const doc = parseCapability(
      `功能: sample\n\n  @human\n  场景: rule\n    - System MUST x\n`,
      'a.feature',
    );
    const codes = doc.errors.map((e) => e.code);
    expect(codes).toContain('missing-header:capability');
    expect(codes).toContain('missing-header:purpose');
    expect(codes).toContain('missing-header:scope');
  });

  test('@human without MUST/SHALL word is reported', () => {
    const doc = parseCapability(HUMAN_RULE('r1').replace('MUST 提供', '提供'));
    expect(doc.errors.map((e) => e.code)).toContain('rule:missing-must-word');
  });

  test('@human and @executable are mutually exclusive; residual @manual is a migration ERROR', () => {
    const src = `${HUMAN_RULE('r1')}
  @req:r1 @human @executable
  场景: 互斥违规
    - 必须 x

  @manual
  场景: 残留 manual
    - 人工检查

  @req:r1 @human @manual
  场景: 与 human 同用的残留 manual
    - 必须 人工评审 x
`;
    const doc = parseCapability(src);
    const codes = doc.errors.map((e) => e.code);
    expect(codes).toContain('tag:mutually-exclusive');
    // removed in 0.3.0: the tag itself is rejected, with or without @human
    expect(codes.filter((c) => c === 'tag:manual-removed')).toHaveLength(2);
    expect(doc.errors.find((e) => e.code === 'tag:manual-removed')?.message).toContain(
      'removed in 0.3.0',
    );
  });

  test('Rule-block nested scenarios are rejected', () => {
    const src = `# language: zh-CN
# capability: sample
# purpose: 测试用途
# scope: x/

功能: sample

  规则: 某规则
    @human
    场景: 被嵌套
      - 系统 MUST x
`;
    const doc = parseCapability(src);
    expect(doc.scenarios).toHaveLength(0);
    expect(doc.errors.map((e) => e.code)).toContain('rule:nested-scenario');
  });

  test('parse failure surfaces SpecParseError after fallback', () => {
    expect(() =>
      parseCapability('功能: x\n  场景: s\n    那么 a\n      """\n      unclosed\n'),
    ).toThrow();
  });
});

describe('buildReqRegistry', () => {
  test('collects global ids and reports duplicate file pairs', () => {
    const a = parseCapability(HUMAN_RULE('r99', 'alpha'), 'alpha.feature');
    const b = parseCapability(HUMAN_RULE('r99', 'beta'), 'beta.feature');
    const c = parseCapability(HUMAN_RULE('r1', 'gamma'), 'gamma.feature');
    const reg = buildReqRegistry([
      { fileName: 'alpha.feature', doc: a },
      { fileName: 'beta.feature', doc: b },
      { fileName: 'gamma.feature', doc: c },
    ]);
    expect(reg.byId.get('r99')).toEqual(['alpha.feature', 'beta.feature']);
    expect(reg.duplicates).toEqual([{ reqId: 'r99', files: ['alpha.feature', 'beta.feature'] }]);
  });
});

const HEAD = `# language: zh-CN
# capability: a
# purpose: p
# scope: x/

功能: a

  @req:r1 @human
  场景: 规则
    - 系统 MUST x
`;

describe('spec authoring helpers (r41-r43)', () => {
  const memIo = (files: Record<string, string>) => {
    const store = { ...files };
    return {
      io: {
        exists: (p: string) => p in store,
        readText: (p: string) => store[p] as string,
        writeText: (p: string, c: string) => {
          store[p] = c;
        },
      },
      store,
    };
  };
  const parse = (content: string) => parseCapability(content, 'a.feature');
  const entriesOf = (...docs: ReturnType<typeof parseCapability>[]) =>
    docs.map((doc, i) => ({ fileName: `${['a', 'b'][i] ?? i}.feature`, doc }));

  test('addReq appends rule; duplicate id and missing keyword rejected', () => {
    const { io, store } = memIo({ 'llmanspec/specs/a.feature': HEAD });
    const entries = entriesOf(parse(HEAD));
    const path = addReq(io, 'llmanspec/specs', entries, {
      capability: 'a',
      reqId: 'r9',
      title: 't',
      statement: '系统 MUST x',
    });
    expect(path).toBe('llmanspec/specs/a.feature');
    expect(store['llmanspec/specs/a.feature']).toInclude('@req:r9 @human');
    expect(() =>
      addReq(
        io,
        'llmanspec/specs',
        entriesOf(parse(store['llmanspec/specs/a.feature'] as string)),
        {
          capability: 'a',
          reqId: 'r9',
          title: 't',
          statement: '系统 MUST x',
        },
      ),
    ).toThrow(/already in use/u);
    expect(() =>
      addReq(io, 'llmanspec/specs', entries, {
        capability: 'a',
        reqId: 'r10',
        title: 't',
        statement: '没有关键词',
      }),
    ).toThrow(/keyword/u);
  });

  test('addScenario requires existing req and appends executable', () => {
    const { io, store } = memIo({ 'llmanspec/specs/a.feature': HEAD });
    const entries = entriesOf(parse(HEAD));
    expect(() =>
      addScenario(io, 'llmanspec/specs', entries, {
        capability: 'a',
        reqId: 'r99',
        scenarioId: 's',
        when: 'w',
        thenText: 't',
      }),
    ).toThrow(/not found/u);
    addScenario(io, 'llmanspec/specs', entries, {
      capability: 'a',
      reqId: 'r1',
      scenarioId: 's1',
      when: '当条件',
      thenText: '那么结果',
    });
    expect(store['llmanspec/specs/a.feature']).toInclude('@req:r1 @executable');
    expect(
      resolveReq(entriesOf(parse(store['llmanspec/specs/a.feature'] as string)), 'r1')?.harness,
    ).toEqual(['a.feature:s1']);
  });

  test('write target resolution: directory-style entry hit, flat-first, miss errors', () => {
    const dirPath = 'llmanspec/specs/a/a.feature';
    // 仅目录式:写入 <cap>/<cap>.feature,不落扁平
    const { io, store } = memIo({ [dirPath]: HEAD });
    const dirEntries = [{ fileName: dirPath, doc: parseCapability(HEAD, dirPath) }];
    const p = addReq(io, 'llmanspec/specs', dirEntries, {
      capability: 'a',
      reqId: 'r9',
      title: 't',
      statement: '系统 MUST x',
    });
    expect(p).toBe(dirPath);
    expect(store[dirPath]).toInclude('@req:r9 @human');
    expect(store['llmanspec/specs/a.feature']).toBeUndefined();
    // 均未命中:报错且零副作用
    const before = store[dirPath];
    expect(() =>
      addReq(io, 'llmanspec/specs', dirEntries, {
        capability: 'zz',
        reqId: 'r11',
        title: 't',
        statement: '系统 MUST x',
      }),
    ).toThrow(/not found/u);
    expect(store[dirPath]).toBe(before);
    // 两处并存:扁平赢
    store['llmanspec/specs/a.feature'] = HEAD;
    const both = [
      ...dirEntries,
      {
        fileName: 'llmanspec/specs/a.feature',
        doc: parseCapability(HEAD, 'llmanspec/specs/a.feature'),
      },
    ];
    const p2 = addScenario(io, 'llmanspec/specs', both, {
      capability: 'a',
      reqId: 'r1',
      scenarioId: 's1',
      when: '当条件',
      thenText: '那么结果',
    });
    expect(p2).toBe('llmanspec/specs/a.feature');
    expect(store['llmanspec/specs/a.feature']).toInclude('@req:r1 @executable');
  });

  test('resolveReq returns null for unknown id; planDedupe remaps conflicts', () => {
    const { io } = memIo({
      'llmanspec/specs/a.feature': HEAD,
      'llmanspec/specs/b.feature': HEAD,
    });
    const dup = entriesOf(
      parse(HEAD),
      parseCapability(HEAD.replace('capability: a', 'capability: b'), 'b.feature'),
    );
    const registry = buildReqRegistry(dup);
    expect(registry.duplicates.length).toBe(1);
    const plan = planDedupe(dup, io, 'llmanspec/specs', registry.duplicates);
    expect(plan[0]?.reqId).toBe('r1');
    expect(io.readText('llmanspec/specs/b.feature')).toInclude(`@req:${plan[0]?.newReqId}`);
  });
});
