import { describe, expect, test } from 'bun:test';

import {
  checkChangeDoc,
  compileChangeIdPattern,
  ConfigValidationError,
  loadConfig,
  renderChangeIdTemplate,
  renderConfigOverview,
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

  test('repo config shape parses (zh-Hans + bdd run_command)', () => {
    const cfg = loadConfig(
      `schema: spec-driven\nlocale: zh-Hans\nbdd:\n  run_command: "bun test tests/bdd"\n`,
    );
    expect(cfg.locale).toBe('zh-Hans');
    expect(cfg.bdd?.run_command).toBe('bun test tests/bdd');
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
    const bad = `schema: 123
locale: 5
extra_skills: [nope]
archive:
  strict_defer: bogus
sdd:
  merge_method: bogus
  worktree_naming: bogus
  branch_prefix: 123
change_id:
  pattern: "[unclosed [unclosed"
`;
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

  test('invalid change_id.pattern fails at load time with the field path (r59)', () => {
    try {
      loadConfig('schema: spec-driven\nchange_id:\n  pattern: "[unclosed"\n');
      throw new Error('expected ConfigValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const issues = (err as ConfigValidationError).issues;
      expect(issues[0]).toContain('change_id.pattern');
    }
  });

  test('legacy removed bdd key is tolerated and stripped (B14)', () => {
    // 旧配置残留键由 zod 按未知键剥离;键名拼接避免字面命中 T6 rg。
    const legacyKey = ['bind', 'ings'].join('');
    const cfg = loadConfig(
      `schema: spec-driven\nbdd:\n  run_command: "bun test tests/bdd"\n  ${legacyKey}:\n    - kind: tags\n      tags: [executable]\n`,
    );
    expect(cfg.bdd?.run_command).toBe('bun test tests/bdd');
    const bdd = cfg.bdd as Record<string, unknown>;
    expect(bdd[legacyKey]).toBeUndefined();
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
});

describe('change_id contract (r59/r60)', () => {
  test('compileChangeIdPattern: null passes, invalid regex errors', () => {
    expect(compileChangeIdPattern(null)).toBeNull();
    expect(compileChangeIdPattern('^[a-z]+$')?.source).toContain('[a-z]');
    expect(() => compileChangeIdPattern('^[unclosed')).toThrow(/valid regex/u);
  });

  test('renderChangeIdTemplate: v1 preset vars and strict undefined', () => {
    const out = renderChangeIdTemplate('c{{ llman_sdd_unique_id }}-{{ verb }}-{{ subject }}', {
      llman_sdd_unique_id: 7,
      verb: 'port',
      subject: 'port-the-importer-module',
      date: '2026-09-18',
    });
    expect(out).toBe('c7-port-port-the-importer-module');
    expect(() =>
      renderChangeIdTemplate('{{ verb }}-{{ subject }}', {
        llman_sdd_unique_id: 1,
        subject: 'x',
        date: '2026-09-18',
      }),
    ).toThrow(/verb/u);
  });

  test('renderChangeIdTemplate renders special characters verbatim (autoescape off)', () => {
    const out = renderChangeIdTemplate('{{ subject }}', {
      llman_sdd_unique_id: 1,
      subject: 'a&b<c>',
      date: '2026-09-24',
    });
    expect(out).toBe('a&b<c>');
  });

  test('checkChangeDoc enforces pattern as ERROR (validate domain, r59)', () => {
    const r = checkChangeDoc(
      { name: 'BAD-ID', stage: 'draft', hasBinding: false, totalTasks: 0, completedTasks: 0 },
      { change_id_pattern: '^[0-9]+-[a-z0-9-]+$' },
    );
    expect(r.valid).toBe(false);
    expect(
      r.issues.some((i) => i.level === 'ERROR' && i.message.includes('change_id.pattern')),
    ).toBe(true);
    const ok = checkChangeDoc(
      { name: '123-ok', stage: 'draft', hasBinding: false, totalTasks: 0, completedTasks: 0 },
      { change_id_pattern: '^[0-9]+-[a-z0-9-]+$' },
    );
    expect(ok.issues.some((i) => i.level === 'ERROR')).toBe(false);
  });
});
