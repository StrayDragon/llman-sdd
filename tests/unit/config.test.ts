import { describe, expect, test } from 'bun:test';

import {
  ConfigValidationError,
  loadConfig,
  renderConfigOverview,
  setExtraSkills,
  skillsJson,
} from '@llman-sdd/core';

const MINIMAL = `schema: spec-driven\n`;

describe('loadConfig', () => {
  test('minimal config: schema required, locale defaults to en', () => {
    const cfg = loadConfig(MINIMAL);
    expect(cfg.schema).toBe('spec-driven');
    expect(cfg.locale).toBe('en');
  });

  test('unknown top-level keys are tolerated', () => {
    const cfg = loadConfig(`${MINIMAL}unknown_key: 1\n`);
    expect(cfg.schema).toBe('spec-driven');
  });

  test('repo config shape parses (zh-Hans + bdd bindings)', () => {
    const cfg = loadConfig(
      `schema: spec-driven\nlocale: zh-Hans\nbdd:\n  run_command: "bun test tests/bdd"\n  bindings:\n    - kind: tags\n      tags: [executable]\n`,
    );
    expect(cfg.locale).toBe('zh-Hans');
    expect(cfg.bdd?.run_command).toBe('bun test tests/bdd');
    expect(cfg.bdd?.bindings?.[0]).toEqual({ kind: 'tags', tags: ['executable'] });
  });

  test('invalid extra_skills value rejected with field path', () => {
    expect(() => loadConfig(`${MINIMAL}extra_skills: [llman-sdd-unknown]\n`)).toThrow(
      /extra_skills/,
    );
  });

  test('wrong schema value rejected', () => {
    expect(() => loadConfig(`schema: something-else\n`)).toThrow(/schema/);
  });

  test('validation failure reports at most 5 issues', () => {
    const bad = `schema: 123\nlocale: 5\nextra_skills: [nope]\nsdd:\n  merge_method: bogus\nbdd:\n  bindings:\n    - kind: tags\n      tags: []\n    - kind: bogus\n      files: []\n`;
    try {
      loadConfig(bad);
      throw new Error('expected ConfigValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const e = err as ConfigValidationError;
      expect(e.issues.length).toBeGreaterThan(5);
      // error message shows at most 5 issue lines
      const lines = e.message.split('\n').filter((l) => l.startsWith('- '));
      expect(lines.length).toBeLessThanOrEqual(5);
    }
  });

  test('yaml syntax error becomes a single-issue ConfigValidationError', () => {
    try {
      loadConfig('schema: [unclosed\n');
      throw new Error('expected ConfigValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect((err as ConfigValidationError).issues[0]).toStartWith('YAML parse error');
    }
  });
});

describe('config command surface (r37/r38)', () => {
  const BASE =
    '# yaml-language-server: $schema=https://x/y.json\nschema: spec-driven\nlocale: en\n';

  test('overview renders the five v1 elements', () => {
    expect(renderConfigOverview(BASE)).toEqual([
      'schema: spec-driven',
      'locale: en',
      'extra_skills (enabled/total): 0 / 6',
      'bdd: off',
      'archive: default',
    ]);
    const full = renderConfigOverview(`schema: spec-driven
locale: zh-Hans
extra_skills:
  - llman-sdd-ff
archive:
  strict_defer: true
bdd:
  framework: pytest-bdd
`);
    expect(full).toEqual([
      'schema: spec-driven',
      'locale: zh-Hans',
      'extra_skills (enabled/total): 1 / 6',
      'bdd: on',
      'archive: configured',
    ]);
  });

  test('setExtraSkills preserves comments and header, round-trips', () => {
    const withComment = `${BASE}# 用户注释别动\nextra_skills:\n  - llman-sdd-ff\n`;
    const after = setExtraSkills(withComment, {
      set: ['llman-sdd-validate'],
      unset: ['llman-sdd-ff'],
    });
    expect(after).toInclude('# 用户注释别动');
    expect(after).toInclude('# yaml-language-server');
    expect(skillsJson(after).enabled).toEqual(['llman-sdd-validate']);
    const back = setExtraSkills(after, { unset: ['llman-sdd-validate'] });
    expect(skillsJson(back).enabled).toEqual([]);
  });

  test('rejects unknown skill names', () => {
    expect(() => setExtraSkills(BASE, { set: ['llman-sdd-unknown'] })).toThrow(
      /unknown extra skill/u,
    );
  });
});
