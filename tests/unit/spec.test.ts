import { describe, expect, test } from 'bun:test';

import {
  addReq,
  addScenario,
  buildReqRegistry,
  hasNativeRules,
  localeToGherkinLang,
  migrateNativeSource,
  parseCapability,
  parseFeatureSource,
  planDedupe,
  resolveReq,
  skeletonContent,
  sourceDialect,
} from '@llman-sdd/core';

const NATIVE_RULE = (req: string, capability = 'sample') => `# language: zh-CN
# capability: ${capability}
# purpose: 测试用途
# scope: x/

功能: ${capability}

  @req:${req}
  规则: 规则样例
    系统 MUST 提供某能力

    场景: 验收样例
      假如 一个初始状态
      当 执行一个动作
      那么 得到一个结果
`;

describe('localeToGherkinLang', () => {
  test('zh-Hans maps to zh-CN, others pass through', () => {
    expect(localeToGherkinLang('zh-Hans')).toBe('zh-CN');
    expect(localeToGherkinLang('en')).toBe('en');
  });
});

describe('parseCapability (native v2)', () => {
  test('parses zh-CN keywords via fallback chain (no header language)', () => {
    const doc = parseCapability(NATIVE_RULE('r1').replace('# language: zh-CN\n', ''));
    expect(doc.featureName).toBe('sample');
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0]?.reqId).toBe('r1');
    expect(doc.rules[0]?.title).toBe('规则样例');
    expect(doc.rules[0]?.description).toInclude('系统 MUST 提供某能力');
    expect(doc.rules[0]?.scenarios).toHaveLength(1);
    expect(doc.rules[0]?.scenarios[0]?.name).toBe('验收样例');
    expect(doc.orphans).toHaveLength(0);
    expect(doc.errors).toHaveLength(0);
  });

  test('nested scenario keeps steps by keyword; top-level scenario becomes an orphan', () => {
    // Gherkin 语法约束:规则块之后的顶层场景会被官方解析器并入该规则,
    // 真正的孤儿只能出现在首个规则块之前(或全文无规则时)。
    const src = `# language: zh-CN
# capability: sample
# purpose: 测试用途
# scope: x/

功能: sample

  场景: 孤儿场景
    假如 孤前提
    当 孤动作
    那么 孤结论

  @req:r1
  规则: 规则样例
    系统 MUST 提供某能力

    场景: 验收样例
      假如 一个初始状态
      当 执行一个动作
      那么 得到一个结果
`;
    const doc = parseCapability(src);
    const nested = doc.rules[0]?.scenarios.find((s) => s.name === '验收样例');
    expect(nested?.stepCount).toBe(3);
    expect(nested?.steps.map((s) => s.kind)).toEqual(['given', 'when', 'then']);
    expect(doc.orphans.map((s) => s.name)).toEqual(['孤儿场景']);
    expect(doc.errors).toHaveLength(0);
  });

  test('missing header comments are reported per key', () => {
    const doc = parseCapability(`功能: sample\n\n  @req:r1\n  规则: 规则\n    描述\n`, 'a.feature');
    const codes = doc.errors.map((e) => e.code);
    expect(codes).toContain('missing-header:capability');
    expect(codes).toContain('missing-header:purpose');
    expect(codes).toContain('missing-header:scope');
  });

  test('rule description is free text: MUST words are not enforced', () => {
    const src = `# language: zh-CN
# capability: demo
# purpose: p
# scope: x/

功能: demo

  @req:r1
  规则: 自由文本规则
    没有 MUST/SHALL 词的自由描述
`;
    const doc = parseCapability(src);
    expect(doc.errors).toHaveLength(0);
    expect(doc.rules[0]?.description).toBe('没有 MUST/SHALL 词的自由描述');
  });

  test('legacy tags are inert: no tag semantics errors, structure still enters IR', () => {
    const src = `# language: zh-CN
# capability: demo
# purpose: p
# scope: x/

功能: demo

  @req:r1 @human @executable
  规则: 带历史标签的规则
    系统 MUST x

    场景: 嵌套验收
      假如 前置
      当 动作
      那么 结果
`;
    const doc = parseCapability(src);
    expect(doc.errors).toHaveLength(0);
    expect(doc.rules[0]?.reqId).toBe('r1');
    expect(doc.rules[0]?.tags).not.toContain('human');
    expect(doc.rules[0]?.scenarios.map((s) => s.name)).toEqual(['嵌套验收']);
  });

  test('bare rule (no nested scenario) parses with empty scenarios', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: demo\n# purpose: p\n# scope: x/\n\n功能: demo\n\n  @req:r1\n  规则: 裸规则\n    描述\n`,
    );
    expect(doc.rules[0]?.scenarios).toHaveLength(0);
    expect(doc.errors).toHaveLength(0);
  });

  test('parse failure surfaces SpecParseError after fallback', () => {
    expect(() =>
      parseCapability('功能: x\n  场景: s\n    那么 a\n      """\n      unclosed\n'),
    ).toThrow();
  });
});

describe('buildReqRegistry (native @req handles on rule headers)', () => {
  test('collects global ids and reports duplicate file pairs', () => {
    const a = parseCapability(NATIVE_RULE('r99', 'alpha'), 'alpha.feature');
    const b = parseCapability(NATIVE_RULE('r99', 'beta'), 'beta.feature');
    const c = parseCapability(NATIVE_RULE('r1', 'gamma'), 'gamma.feature');
    const reg = buildReqRegistry([
      { fileName: 'alpha.feature', doc: a },
      { fileName: 'beta.feature', doc: b },
      { fileName: 'gamma.feature', doc: c },
    ]);
    expect(reg.byId.get('r99')).toEqual(['alpha.feature', 'beta.feature']);
    expect(reg.duplicates).toEqual([{ reqId: 'r99', files: ['alpha.feature', 'beta.feature'] }]);
  });

  test('rule header without @req yields an empty reqId (not registered)', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: demo\n# purpose: p\n# scope: x/\n\n功能: demo\n\n  规则: 无句柄规则\n    描述\n`,
    );
    expect(doc.rules[0]?.reqId).toBe('');
    const reg = buildReqRegistry([{ fileName: 'demo.feature', doc }]);
    expect(reg.byId.size).toBe(0);
  });
});

const HEAD = `# language: zh-CN
# capability: a
# purpose: p
# scope: x/

功能: a

  @req:r1
  规则: 规则
    系统 MUST x
`;

describe('spec authoring helpers (r41-r43, native v2)', () => {
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

  test('addReq appends a native rule block; duplicate id rejected; free-text statement allowed', () => {
    const { io, store } = memIo({ 'llmanspec/specs/a.feature': HEAD });
    const entries = entriesOf(parse(HEAD));
    const path = addReq(io, 'llmanspec/specs', entries, {
      capability: 'a',
      reqId: 'r9',
      title: 't',
      statement: '系统 MUST x',
    });
    expect(path).toBe('llmanspec/specs/a.feature');
    expect(store['llmanspec/specs/a.feature']).toInclude('@req:r9');
    expect(store['llmanspec/specs/a.feature']).toInclude('规则: t');
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
    // 自由文本:无 MUST/SHALL 词强制
    addReq(io, 'llmanspec/specs', entries, {
      capability: 'a',
      reqId: 'r10',
      title: 't2',
      statement: '没有关键词的自由描述',
    });
    expect(store['llmanspec/specs/a.feature']).toInclude('没有关键词的自由描述');
  });

  test('addScenario inserts a nested scenario under the target rule and stays parseable', () => {
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
      when: '执行动作',
      thenText: '得到结果',
    });
    const doc = parseCapability(store['llmanspec/specs/a.feature'] as string, 'a.feature');
    expect(doc.errors).toHaveLength(0);
    const sc = doc.rules[0]?.scenarios.find((x) => x.name === 's1');
    expect(sc?.steps.map((s) => s.kind)).toEqual(['when', 'then']);
    expect(resolveReq(entriesOf(doc), 'r1')?.harness).toEqual(['a.feature:s1']);
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
    expect(store[dirPath]).toInclude('@req:r9');
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
      when: '执行动作',
      thenText: '得到结果',
    });
    expect(p2).toBe('llmanspec/specs/a.feature');
    expect(store['llmanspec/specs/a.feature']).toInclude('场景: s1');
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

  test('fr spec files get official fr keywords for appended blocks and scenarios', () => {
    // 边界正则由官方词表构建:fr 块关键字 Règle/Scénario 也被识别为块边界
    const fr = `# language: fr
# capability: démo
# purpose: démo
# scope: x/

Fonctionnalité: démo

  @req:r1
  Règle: règle une
    Le système MUST x

  @req:r2
  Règle: règle deux
    Le système MUST y
`;
    const { io, store } = memIo({ 'llmanspec/specs/a.feature': fr });
    const path = addReq(io, 'llmanspec/specs', entriesOf(parse(fr)), {
      capability: 'a',
      reqId: 'r3',
      title: 't',
      statement: 'Le système MUST z',
    });
    expect(store[path]).toInclude('Règle: t');
    const content = store[path] as string;
    const doc2 = parseCapability(content, 'a.feature');
    addScenario(io, 'llmanspec/specs', entriesOf(doc2), {
      capability: 'a',
      reqId: 'r1',
      scenarioId: 's1',
      when: 'le système agit',
      thenText: 'la sortie MUST être `1`',
    });
    const updated = store[path] as string;
    // 嵌套场景插在 r1 块内(r2 之前)而非文件尾;fr 官方表 scenario 首个同义词是 Exemple
    expect(updated.indexOf('Exemple: s1')).toBeGreaterThan(-1);
    expect(updated.indexOf('Exemple: s1')).toBeLessThan(updated.indexOf('@req:r2'));
    expect(updated).toInclude('Quand le système agit');
    expect(updated).toInclude('Alors la sortie MUST être `1`');
    const reparsed = parseCapability(updated, 'a.feature');
    expect(reparsed.errors).toHaveLength(0);
    const nested = reparsed.rules[0]?.scenarios[0];
    expect(nested?.steps.map((s) => s.kind)).toEqual(['when', 'then']);
  });
});

describe('migrateNativeSource roundtrip', () => {
  const LEGACY = `# language: zh-CN
# capability: demo
# purpose: p
# scope: x/

功能: demo

  @req:r1 @human
  场景: 历史规则
    - 系统 MUST x

  @req:r1 @executable
  场景: 历史验收
    假如 前置
    当 动作
    那么 结果
`;

  test('legacy source is detected as non-native; migrated output parses to equivalent structure', () => {
    expect(hasNativeRules(LEGACY)).toBe(false);
    const res = migrateNativeSource(LEGACY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(hasNativeRules(res.content)).toBe(true);
    const doc = parseCapability(res.content, 'demo.feature');
    expect(doc.errors).toHaveLength(0);
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0]?.reqId).toBe('r1');
    expect(doc.rules[0]?.title).toBe('历史规则');
    expect(doc.rules[0]?.description.replaceAll('- ', '')).toContain('系统 MUST x');
    const sc = doc.rules[0]?.scenarios[0];
    expect(sc?.name).toBe('历史验收');
    expect(sc?.steps.map((s) => s.kind)).toEqual(['given', 'when', 'then']);
    expect(doc.orphans).toHaveLength(0);
  });

  test('rule scenario with inline steps keeps them as a nested acceptance scenario', () => {
    // issue #2: 描述与步骤同体的 legacy 规则场景,其自身 steps 不得被静默丢弃,
    // 合成为该规则块内紧跟描述之后的自动嵌套场景,关键字与文本原样保留。
    const src = `# language: zh-CN
# capability: demo
# purpose: p
# scope: x/

功能: demo

  @req:r1 @human
  场景: 稳定输出
    - 系统 MUST 输出稳定结果。
    假如 输入为 \`1\`
    当 系统执行
    那么 输出 MUST 为 \`1\`
`;
    const res = migrateNativeSource(src);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rules).toBe(1);
    expect(res.scenarios).toBe(1);
    const doc = parseCapability(res.content, 'demo.feature');
    expect(doc.errors).toHaveLength(0);
    const sc = doc.rules[0]?.scenarios[0];
    expect(sc?.name).toBe('验收示例');
    expect(sc?.steps.map((s) => s.kind)).toEqual(['given', 'when', 'then']);
    expect(sc?.steps[0]?.text).toBe('输入为 `1`');
    expect(doc.rules[0]?.description).toContain('系统 MUST 输出稳定结果。');
  });

  test('en dialect legacy source migrates to a single-dialect en output (issue #3)', () => {
    const src = `# language: en
# capability: demo
# purpose: demo
# scope: src/

Feature: demo

  @req:r1 @human
  Scenario: stable output
    - System MUST produce stable results.
    Given input is \`1\`
    When system runs
    Then output MUST be \`1\`
`;
    const res = migrateNativeSource(src);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // preamble (en header + Feature line) preserved verbatim, en keywords
    expect(res.content).toInclude('# language: en');
    expect(res.content).toInclude('Feature: demo');
    expect(res.content).toInclude('Rule: stable output');
    expect(res.content).not.toInclude('规则:');
    expect(res.content).toInclude('Scenario: Acceptance example');
    const doc = parseCapability(res.content, 'demo.feature');
    expect(doc.errors).toHaveLength(0);
    const sc = doc.rules[0]?.scenarios[0];
    expect(sc?.name).toBe('Acceptance example');
    expect(sc?.steps.map((s) => s.kind)).toEqual(['given', 'when', 'then']);
    expect(doc.rules[0]?.description).toContain('System MUST produce stable results.');
  });

  test('zh-CN dialect output keeps Chinese keywords (regression)', () => {
    const src = `# language: zh-CN
# capability: demo
# purpose: p
# scope: x/

功能: demo

  @req:r1 @human
  场景: 历史规则
    - 系统 MUST x

  @req:r1 @executable
  场景: 历史验收
    假如 前置
    当 动作
    那么 结果
`;
    const res = migrateNativeSource(src);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.content).toInclude('规则: 历史规则');
    expect(res.content).toInclude('场景: 历史验收');
    expect(res.content).not.toInclude('Rule:');
    const doc = parseCapability(res.content, 'demo.feature');
    expect(doc.errors).toHaveLength(0);
  });

  test('fr dialect legacy source migrates with official fr keywords (issue #3 family)', () => {
    const src = `# language: fr
# capability: démo
# purpose: démo
# scope: src/

Fonctionnalité: démo

  @req:r1 @human
  Scénario: sortie stable
    - Le système MUST produire des résultats stables.
    Soit une entrée \`1\`
    Quand le système s'exécute
    Alors la sortie MUST être \`1\`
`;
    const res = migrateNativeSource(src);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.content).toInclude('# language: fr');
    expect(res.content).toInclude('Fonctionnalité: démo');
    expect(res.content).toInclude('Règle: sortie stable');
    // fr 官方表 scenario 首个同义词是 Exemple —— 关键字取自官方词表而非手写偏好
    expect(res.content).toInclude('Exemple: Acceptance example');
    expect(res.content).not.toInclude('规则:');
    expect(res.content).not.toInclude('Rule:');
    const doc = parseCapability(res.content, 'démo.feature');
    expect(doc.errors).toHaveLength(0);
    const sc = doc.rules[0]?.scenarios[0];
    expect(sc?.name).toBe('Acceptance example');
    expect(sc?.steps.map((s) => s.kind)).toEqual(['given', 'when', 'then']);
  });

  test('unbound acceptance migrates to natural functional home (no orphan concept)', () => {
    // 孤儿概念已废除:无归属验收按文件顺序置于末尾,官方解析器将其并入前一
    // 规则,即其功能级归属;不产生任何孤儿/告警语义。
    const src = `# language: zh-CN
# capability: demo
# purpose: p
# scope: x/

功能: demo

  @req:r1 @human
  场景: 历史规则
    系统 MUST x

  @req:r2 @executable
  场景: 无归验收
    假如 前置
    当 动作
    那么 结果
`;
    const res = migrateNativeSource(src);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const doc = parseCapability(res.content, 'demo.feature');
    expect(doc.errors).toHaveLength(0);
    expect(doc.orphans).toHaveLength(0);
    expect(doc.rules[0]?.scenarios.map((s) => s.name)).toContain('无归验收');
  });
});

describe('skeletonContent dialect vocabulary (r7/r88)', () => {
  test('en locale skeleton uses official en keywords throughout (no zh mixing)', () => {
    const content = skeletonContent('demo', 'r1', 'en');
    expect(content.startsWith('# language: en\n')).toBe(true);
    expect(content).toInclude('Feature: demo');
    expect(content).toInclude('Rule: TODO-rule');
    expect(content).toInclude('Scenario: TODO-acceptance');
    expect(content).toInclude('Given TODO precondition');
    expect(content).not.toInclude('假如');
    expect(content).not.toInclude('规则');
  });

  test('fr locale skeleton passes the locale through with official fr keywords', () => {
    const content = skeletonContent('demo', 'r1', 'fr');
    expect(content.startsWith('# language: fr\n')).toBe(true);
    expect(content).toInclude('Fonctionnalité: demo');
    expect(content).toInclude('Règle: TODO-rule');
    expect(content).toInclude('Soit TODO precondition');
    const { doc } = parseFeatureSource(content);
    expect(doc.feature?.name).toBe('demo');
  });

  test('zh-Hans skeleton output is byte-identical to the contract keywords', () => {
    const content = skeletonContent('demo', 'r1', 'zh-Hans');
    expect(content.startsWith('# language: zh-CN\n')).toBe(true);
    expect(content).toInclude('功能: demo');
    expect(content).toInclude('规则: TODO-rule');
    expect(content).toInclude('场景: TODO-acceptance');
    expect(content).toInclude('假如 TODO 前置');
  });
});

describe('sourceDialect — unified per-file dialect policy (r41/r88)', () => {
  test('explicit # language: header wins, including unknown names (returned as-is)', () => {
    const zh = `# language: zh-CN
功能: x
`;
    expect(sourceDialect(zh)).toBe('zh-CN');
    const fr = `# language: fr
Fonctionnalité: x
`;
    expect(sourceDialect(fr)).toBe('fr');
    const unknown = `# language: klingon
Feature: x
`;
    expect(sourceDialect(unknown)).toBe('klingon');
  });

  test('headerless zh content auto-discovers zh-CN via the matcher chain', () => {
    const src = `功能: 无头中文

  @req:r1
  规则: 规则
    系统 MUST x
`;
    expect(sourceDialect(src)).toBe('zh-CN');
  });

  test('headerless en content discovers en; undiscoverable content falls back to en', () => {
    expect(sourceDialect('Feature: x\n')).toBe('en');
    expect(sourceDialect('not a feature at all')).toBe('en');
  });
});
