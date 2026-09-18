import { describe, expect, test } from 'bun:test';

import {
  checkChangeDoc,
  compileChangeIdPattern,
  ConfigValidationError,
  loadConfig,
  renderChangeIdTemplate,
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
