import { describe, expect, test } from 'bun:test';

import { ConfigValidationError, loadConfig } from '@llman-sdd/core';

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
