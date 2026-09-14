import { describe, expect, test } from 'bun:test';

import {
  buildTemplateVars,
  enforceEthicsGovernance,
  loadConfig,
  localeFallbacks,
  normalizeLocale,
  renderTemplate,
  renderWithUnits,
  skillCandidates,
} from '@llman-sdd/core';

describe('renderTemplate (nunjucks adapter)', () => {
  test('undefined variables render empty (Lenient)', () => {
    expect(renderTemplate('a={{ nope }}', new Map(), {})).toBe('a=');
  });

  test('string globals substitute', () => {
    expect(renderTemplate('v={{ llman_version }}', new Map(), { llman_version: '0.1.0' })).toBe(
      'v=0.1.0',
    );
  });

  test('single trailing newline of source is stripped (keep_trailing_newline=false)', () => {
    expect(renderTemplate('x\n', new Map(), {})).toBe('x');
    expect(renderWithUnits('x\n', new Map(), {})).toBe('x');
  });

  test('unit() expands recursively; missing id errors; depth capped', () => {
    const units = new Map([
      ['a', 'A{{ unit("b") }}'],
      ['b', 'B'],
    ]);
    expect(renderTemplate('{{ unit("a") }}', units, {})).toBe('AB');
    expect(() => renderTemplate('{{ unit("nope") }}', units, {})).toThrow(/missing template unit/);

    const cyclic = new Map([['x', 'X{{ unit("x") }}']]);
    expect(() => renderTemplate('{{ unit("x") }}', cyclic, {})).toThrow(/nesting exceeded/);
  });

  test('product trailing whitespace is trimmed', () => {
    expect(renderTemplate('x  \n\n', new Map(), {})).toBe('x');
  });
});

describe('locale chain', () => {
  test('normalizeLocale mappings', () => {
    expect(normalizeLocale('zh-Hans')).toBe('zh-Hans');
    expect(normalizeLocale('zh-CN')).toBe('zh-Hans');
    expect(normalizeLocale('zh')).toBe('zh-Hans');
    expect(normalizeLocale('en_US')).toBe('en');
    expect(normalizeLocale('')).toBe('en');
  });
  test('fallback chain is normalized → language part → en, deduped', () => {
    expect(localeFallbacks('zh-Hans')).toEqual(['zh-Hans', 'zh', 'en']);
    expect(localeFallbacks('en')).toEqual(['en']);
  });
});

describe('buildTemplateVars', () => {
  test('bdd vars and extra_skill key naming', () => {
    const cfg = loadConfig(
      `schema: spec-driven\nextra_skills:\n  - llman-sdd-arch-review\nbdd:\n  framework: ""\n  run_command: bun test\n`,
    );
    const vars = buildTemplateVars(cfg, '9.9.9');
    expect(vars['llman_version']).toBe('9.9.9');
    expect(vars['bdd_enabled']).toBe('true');
    expect(vars['bdd_run_command']).toBe('bun test');
    expect(vars['extra_skill_arch_review']).toBe('true');
    expect(vars['extra_skill_continue']).toBeUndefined();
  });
  test('effectiveRunCommand derives from framework', () => {
    const cfg = loadConfig(`schema: spec-driven\nbdd:\n  framework: pytest-bdd\n`);
    const vars = buildTemplateVars(cfg, '1');
    expect(vars['bdd_run_command']).toBe('pytest {feature_dir} -k {feature_name} -v');
  });
});

describe('skills', () => {
  test('candidates = 10 defaults + enabled extras only', () => {
    const base = loadConfig(`schema: spec-driven\n`);
    expect(skillCandidates(base)).toHaveLength(10);
    const withExtra = loadConfig(`schema: spec-driven\nextra_skills:\n  - llman-sdd-continue\n`);
    const candidates = skillCandidates(withExtra);
    expect(candidates).toHaveLength(11);
    expect(candidates).toContain('llman-sdd-continue.md');
  });

  test('ethics gate rejects products missing governance keys', () => {
    expect(() => enforceEthicsGovernance([{ name: 'x.md', content: 'no keys here' }])).toThrow(
      /ethics.risk_level/,
    );
    const complete = ETHICS_SAMPLE;
    expect(() => enforceEthicsGovernance([{ name: 'x.md', content: complete }])).not.toThrow();
  });
});

const ETHICS_SAMPLE = `ethics.risk_level: low
ethics.prohibited_actions: none
ethics.required_evidence: evidence
ethics.refusal_contract: refuse
ethics.escalation_policy: ask
`;
