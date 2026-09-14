import { describe, expect, test } from 'bun:test';

import { buildReqRegistry, localeToGherkinLang, parseCapability } from '@llman-sdd/core';

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

  test('@human and @executable are mutually exclusive; @manual requires @human', () => {
    const src = `${HUMAN_RULE('r1')}
  @req:r1 @human @executable
  场景: 互斥违规
    - 必须 x

  @manual
  场景: 孤儿 manual
    - 人工检查
`;
    const codes = parseCapability(src).errors.map((e) => e.code);
    expect(codes).toContain('tag:mutually-exclusive');
    expect(codes).toContain('tag:manual-orphan');
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
