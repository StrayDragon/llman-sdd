import { describe, expect, test } from 'bun:test';

import {
  checkChangeDoc,
  checkGlobalChangeIdUniqueness,
  discoverSpecs,
  parseCapability,
  validateAllSpecs,
  validateChange,
  type ChangeFsIoLite,
  type DiscoveryIo,
  type HarnessRunner,
  type SpecEntry,
} from '@llman-sdd/core';

import {
  expandRunCommand,
  runHarnessForSpecs,
  type HarnessGate,
} from '../../packages/core/src/validation/harness.ts';

const io: DiscoveryIo = {
  exists: (p) => p.startsWith('llmanspec/') || p.startsWith('src/'),
  isDirectory: (p) => !p.endsWith('.feature') && p.startsWith('llmanspec/'),
  listDir: (p) =>
    p === 'llmanspec/specs' || p === 'llmanspec/specs/'
      ? ['a.feature', 'b.feature', 'sub']
      : p === 'llmanspec/specs/sub' || p === 'llmanspec/specs/sub/'
        ? ['c.feature']
        : [],
  readText: (p) => {
    const body = (cap: string, req: string): string =>
      `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n\n  @req:${req}\n  规则: ok\n    系统 MUST x\n\n    场景: acc\n      假如 状态\n      当 动作\n      那么 结果\n`;
    if (p.endsWith('a.feature')) return body('a', 'r1');
    if (p.endsWith('b.feature')) return body('b', 'r2');
    return body('c', 'r3');
  },
};

describe('discoverSpecs', () => {
  test('walks nested dirs via injected io', () => {
    const entries = discoverSpecs('llmanspec/specs/', io);
    expect(entries.map((e) => e.fileName)).toEqual([
      'llmanspec/specs/a.feature',
      'llmanspec/specs/b.feature',
      'llmanspec/specs/sub/c.feature',
    ]);
  });
});

describe('validateAllSpecs (native v2)', () => {
  const native = (cap: string, body: string): string =>
    `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n${body}`;

  test('clean specs pass with predecessor-style report lines', () => {
    const entries: SpecEntry[] = [
      { fileName: 'a.feature', doc: parseCapability(io.readText('a.feature'), 'a.feature') },
    ];
    const report = validateAllSpecs(entries, io);
    expect(report.failed).toBe(false);
    expect(report.lines.at(-1)).toBe('Totals: 1 passed, 0 failed (1 items)');
    expect(report.lines[0]).toBe('OK spec/a');
  });

  test('rule description is free text: no MUST/SHALL enforcement (predecessor MUST gate removed)', () => {
    const doc = parseCapability(
      native('t', `功能: t\n\n  @req:r1\n  规则: ok\n    系统 可以直接使用,无需变更\n`),
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(false);
    expect(report.lines.join('\n')).not.toInclude('MUST/SHALL');
  });

  test('rule block without @req tag fails', () => {
    const doc = parseCapability(native('t', `功能: t\n\n  规则: ok\n    系统 MUST x\n`));
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.lines.join('\n')).toInclude(
      'rule must carry an @req:<req_id> tag on the rule header',
    );
  });

  test('legacy tags on rule blocks are inert: no mutual-exclusion error', () => {
    const doc = parseCapability(
      native('t', `功能: t\n\n  @req:r1 @human @executable\n  规则: ok\n    系统 MUST x\n`),
    );
    expect(doc.errors.map((e) => e.code)).not.toContain('tag:rule-exec-exclusive');
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(false);
  });

  test('bare rule (no nested scenario) is not guarded: validation stays valid', () => {
    const doc = parseCapability(native('t', `功能: t\n\n  @req:r1\n  规则: ok\n    系统 MUST x\n`));
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(false);
    expect(report.lines.join('\n')).not.toInclude('not guarded');
  });

  test('rule with a nested linked acceptance passes without dangling-link errors', () => {
    const doc = parseCapability(
      native(
        't',
        `功能: t\n\n  @req:r1\n  规则: ok\n    系统 MUST x\n\n    场景: acc\n      假如 一个有效工作区\n      当 运行校验\n      那么 退出码为 0\n`,
      ),
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(false);
    expect(report.lines.join('\n')).not.toInclude('has no matching rule');
    expect(report.lines.join('\n')).not.toInclude('orphan scenario');
  });

  test('capability with zero rules fails even with only acceptance scenarios', () => {
    const doc = parseCapability(
      native(
        't',
        `功能: t\n\n  场景: acc\n    假如 一个有效工作区\n    当 运行校验\n    那么 退出码为 0\n`,
      ),
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.lines.join('\n')).toInclude('spec must define at least one rule');
  });

  test('valid_scope missing on disk fails', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: t\n# purpose: p\n# scope: nope/\n\n功能: t\n\n  @req:r1\n  规则: ok\n    系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.lines.join('\n')).toInclude('valid_scope path(s) do not exist on disk: nope/');
  });

  test('duplicate req ids fail every involved capability', () => {
    const mk = (cap: string): SpecEntry => ({
      fileName: `${cap}.feature`,
      doc: parseCapability(
        `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n\n  @req:r9\n  规则: ok\n    系统 MUST x\n`,
        `${cap}.feature`,
      ),
    });
    const report = validateAllSpecs([mk('a'), mk('b')], io);
    expect(report.lines[0]).toBe('FAIL spec/a');
    expect(report.lines.filter((l) => l === 'FAIL spec/b')).toHaveLength(1);
    expect(report.lines.at(-1)).toBe('Totals: 0 passed, 2 failed (2 items)');
  });

  test('missing capability header fails (predecessor short-circuit); missing purpose is ERROR', () => {
    const doc = parseCapability(
      `# scope: llmanspec/\n\n功能: t\n\n  @req:r1\n  规则: ok\n    系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(true);
    const joined = report.lines.join('\n');
    // predecessor parity: missing capability short-circuits to file + registry issues.
    expect(joined).toInclude('missing `# capability:` header comment');

    const withCap = parseCapability(
      `# capability: t\n# scope: llmanspec/\n\n功能: t\n\n  @req:r1\n  规则: ok\n    系统 MUST x\n`,
    );
    const report2 = validateAllSpecs([{ fileName: 't.feature', doc: withCap }], io);
    const joined2 = report2.lines.join('\n');
    // predecessor parity: missing/empty purpose is an ERROR at `{cap}/purpose`.
    expect(joined2).toInclude('[ERROR] t/purpose: `# purpose:` header comment must not be empty');
  });
});

describe('checkChangeDoc + placeholders (r47/r48)', () => {
  const BASE = {
    name: 'c1',
    stage: 'planned' as const,
    hasBinding: true,
    totalTasks: 2,
    completedTasks: 2,
  };

  test('pending tasks: warning by default, error with strict_defer', () => {
    const pending = { ...BASE, completedTasks: 1 };
    expect(checkChangeDoc(pending, {}).issues[0]?.level).toBe('WARNING');
    expect(checkChangeDoc(pending, { strict_defer: true }).issues[0]?.level).toBe('ERROR');
  });

  test('stage gate lives in validateChange (D8/D8b: ratio gate removed)', () => {
    // The stage-ordinal branch is gone (D8); --stage is judged by
    // validateChange's artifact-presence gate.
    const files: Record<string, string> = {
      './llmanspec/changes/demo/proposal.md': '---\ndepends_on: []\n---\n\n## Why\nx\n',
    };
    const io = {
      exists: (p: string) => files[p] !== undefined,
      readText: (p: string) => {
        const v = files[p];
        if (v === undefined) throw new Error(`missing ${p}`);
        return v;
      },
      listDir: (): string[] => [],
      isDirectory: (): boolean => false,
    };
    const g = validateChange(io, '.', 'demo', {}, { stage: 'full' });
    expect(g.issues.some((i) => i.message.includes('Stage forced to'))).toBe(true);
    expect(g.valid).toBe(false);
  });

  test('unbound is warning only', () => {
    const r = checkChangeDoc({ ...BASE, hasBinding: false }, {});
    expect(r.valid).toBe(true);
    expect(r.issues[0]?.level).toBe('WARNING');
  });
});

describe('validateChange completeness WARNINGs (r63)', () => {
  const proposalWithBinding = (needs: string): string =>
    `---\ndepends_on: []\nbranch: sdd/demo\nbase_branch: main\nbase_sha: abc\nneeds_specs_change: ${needs}\n---\n\n## Why\nx\n\n## What Changes\n- y\n`;

  const files = (needs: string): Record<string, string> => ({
    'llmanspec/changes/demo/proposal.md': proposalWithBinding(needs),
    'llmanspec/changes/demo/design.md': '# design\n',
    'llmanspec/changes/demo/tasks.md': '# Tasks\n- [x] done\n',
  });

  const norm = (p: string): string => p.replace(/^\.\//u, '');
  const io = (files: Record<string, string>) => ({
    exists: (p: string) => files[norm(p)] !== undefined,
    readText: (p: string) => {
      const v = files[norm(p)];
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    },
    listDir: (): string[] => [],
    isDirectory: (): boolean => false,
  });

  const gitWith = (diffOut: string) => ({
    run: (): string => '',
    runOpt: (_args: string[]): string | null => (diffOut === '' ? null : diffOut),
  });

  const config = { strict_defer: null, change_id_pattern: null };
  const opts = (git: ReturnType<typeof gitWith> | undefined) => ({ git });

  test('full + bound + no specs diff → skill-guided WARNING', () => {
    const r = validateChange(io(files('true')), '.', 'demo', config, opts(gitWith('src/x.ts\n')));
    const w = r.issues.find((i) => i.level === 'WARNING' && i.path === 'proposal.md');
    expect(w?.message).toContain('specs not landed');
    expect(w?.message).toContain('llman-sdd-propose');
    expect(w?.message).toContain('do NOT re-run change start');
  });

  test('no warning when specs landed on the bound branch', () => {
    const r = validateChange(
      io(files('true')),
      '.',
      'demo',
      config,
      opts(gitWith('llmanspec/specs/demo.feature\n')),
    );
    expect(r.issues.some((i) => i.message.includes('specs not landed'))).toBe(false);
  });

  test('no warning when needs_specs_change: false', () => {
    const r = validateChange(io(files('false')), '.', 'demo', config, opts(gitWith('src/x.ts\n')));
    expect(r.issues.some((i) => i.message.includes('specs not landed'))).toBe(false);
  });

  test('no warning when not bound (planned stage)', () => {
    const bare: Record<string, string> = {
      'llmanspec/changes/demo/proposal.md': '---\ndepends_on: []\n---\n\n## Why\nx\n',
      'llmanspec/changes/demo/design.md': '# design\n',
      'llmanspec/changes/demo/tasks.md': '# Tasks\n- [x] done\n',
    };
    const r = validateChange(io(bare), '.', 'demo', config, opts(gitWith('src/x.ts\n')));
    expect(r.issues.some((i) => i.message.includes('specs not landed'))).toBe(false);
  });
});

describe('T5: bdd harness core (r13/r48)', () => {
  const gateWith = (runner: HarnessRunner | undefined, runCommand: string | null): HarnessGate => ({
    nested: false,
    check: 'default',
    runner,
    runCommand,
    cwd: '/tmp/repo',
  });

  test('placeholder expansion: flat and directory layouts', () => {
    expect(
      expandRunCommand('run {feature_path} {feature_dir} {feature_name}', {
        capability: 'auth',
        featurePath: 'llmanspec/specs/auth.feature',
      }),
    ).toBe('run llmanspec/specs/auth.feature llmanspec/specs auth');
    expect(
      expandRunCommand('run {feature_path} {feature_dir} {feature_name}', {
        capability: 'billing',
        featurePath: 'llmanspec/specs/billing/billing.feature',
      }),
    ).toBe('run llmanspec/specs/billing/billing.feature llmanspec/specs/billing billing');
  });

  test('batch-once: identical expanded commands run the runner exactly once', () => {
    let calls = 0;
    const runner: HarnessRunner = {
      run: (): { exitCode: number | null; output: string } => {
        calls += 1;
        return { exitCode: 0, output: '' };
      },
    };
    const outcome = runHarnessForSpecs(
      [
        { capability: 'a', featurePath: 'llmanspec/specs/a.feature' },
        { capability: 'b', featurePath: 'llmanspec/specs/b.feature' },
      ],
      gateWith(runner, 'echo run'),
    );
    expect(calls).toBe(1);
    expect(outcome.executed).toBe(true);
    expect(outcome.issuesByCapability.get('b')?.[0]?.message).toBe(
      'bdd harness passed (cached): echo run',
    );
  });

  test('result mapping: exit 0 → INFO passed', () => {
    const outcome = runHarnessForSpecs(
      [{ capability: 'a', featurePath: 'llmanspec/specs/a.feature' }],
      gateWith({ run: () => ({ exitCode: 0, output: '' }) }, 'true'),
    );
    const issue = outcome.issuesByCapability.get('a')?.[0];
    expect(issue?.level).toBe('INFO');
    expect(issue?.message).toStartWith('bdd harness passed: true');
  });

  test('result mapping: non-zero exit → ERROR failed (exit N) with output tail', () => {
    const outcome = runHarnessForSpecs(
      [{ capability: 'a', featurePath: 'llmanspec/specs/a.feature' }],
      gateWith({ run: () => ({ exitCode: 3, output: 'boom' }) }, 'false'),
    );
    const issue = outcome.issuesByCapability.get('a')?.[0];
    expect(issue?.level).toBe('ERROR');
    expect(issue?.message).toStartWith('bdd harness failed (exit 3): false: boom');
  });

  test('result mapping: cached failure keeps ERROR and points at the original summary', () => {
    const outcome = runHarnessForSpecs(
      [
        { capability: 'a', featurePath: 'llmanspec/specs/a.feature' },
        { capability: 'b', featurePath: 'llmanspec/specs/b.feature' },
      ],
      gateWith({ run: () => ({ exitCode: 3, output: 'boom' }) }, 'false'),
    );
    const issue = outcome.issuesByCapability.get('b')?.[0];
    expect(issue?.level).toBe('ERROR');
    expect(issue?.message).toStartWith(
      'bdd harness failed (cached result of false): bdd harness failed (exit 3)',
    );
  });

  test('result mapping: spawn failure → ERROR could not start', () => {
    const outcome = runHarnessForSpecs(
      [{ capability: 'a', featurePath: 'llmanspec/specs/a.feature' }],
      gateWith(
        { run: () => ({ exitCode: null, output: '', spawnError: 'sh not found' }) },
        'anything',
      ),
    );
    const issue = outcome.issuesByCapability.get('a')?.[0];
    expect(issue?.level).toBe('ERROR');
    expect(issue?.message).toStartWith('bdd harness could not start: anything: sh not found');
  });

  test('trigger matrix: --no-check and nested guard never run the runner', () => {
    let calls = 0;
    const runner: HarnessRunner = {
      run: (): { exitCode: number | null; output: string } => {
        calls += 1;
        return { exitCode: 0, output: '' };
      },
    };
    const targets = [{ capability: 'a', featurePath: 'llmanspec/specs/a.feature' }];
    const off = runHarnessForSpecs(targets, { ...gateWith(runner, 'x'), check: 'off' });
    expect(off.issuesByCapability.size).toBe(0);
    expect(off.executed).toBe(false);
    const nested = runHarnessForSpecs(targets, { ...gateWith(runner, 'x'), nested: true });
    expect(nested.issuesByCapability.get('a')?.[0]?.message).toBe(
      'bdd harness skipped: nested invocation',
    );
    expect(nested.issuesByCapability.get('a')?.[0]?.level).toBe('INFO');
    expect(calls).toBe(0);
  });

  test('trigger matrix: --check without configured run_command → single INFO on first spec', () => {
    const outcome = runHarnessForSpecs(
      [
        { capability: 'a', featurePath: 'llmanspec/specs/a.feature' },
        { capability: 'b', featurePath: 'llmanspec/specs/b.feature' },
      ],
      { ...gateWith(undefined, null), check: 'on' },
    );
    expect(outcome.issuesByCapability.get('a')?.[0]?.message).toBe(
      '--check has no effect: bdd.run_command is not configured',
    );
    expect(outcome.issuesByCapability.has('b')).toBe(false);
    expect(outcome.executed).toBe(false);
  });
});

describe('T2: dependency reference resolution (r73)', () => {
  /** Mock io over a file map: directories derive from file paths; archive/
   * entries materialize as real dirs so the fixture has changes/archive/. */
  const makeRefIo = (files: Record<string, string>): ChangeFsIoLite => {
    const dirs = new Set<string>();
    for (const f of Object.keys(files)) {
      const parts = f.split('/');
      parts.pop();
      while (parts.length > 0) {
        dirs.add(parts.join('/'));
        parts.pop();
      }
    }
    return {
      exists: (p) => files[p] !== undefined || dirs.has(p),
      readText: (p) => {
        const v = files[p];
        if (v === undefined) throw new Error(`missing ${p}`);
        return v;
      },
      listDir: (p) => [
        ...new Set(
          [...Object.keys(files), ...dirs]
            .filter((e) => e.startsWith(`${p}/`))
            .map((e) => e.slice(p.length + 1).split('/')[0] as string),
        ),
      ],
      isDirectory: (p) => dirs.has(p),
    };
  };

  const config = { strict_defer: null, change_id_pattern: null };
  const archiveAt = (name: string): Record<string, string> => ({
    [`./llmanspec/changes/archive/${name}/proposal.md`]: '---\ndepends_on: []\n---\nx\n',
  });
  const run = (files: Record<string, string>) =>
    validateChange(makeRefIo(files), '.', 'demo', config, {});

  test('unknown dep is flagged even when changes/archive/ exists (fixture blind-spot fix)', () => {
    const r = run({
      './llmanspec/changes/demo/proposal.md': '---\ndepends_on: [ghost]\n---\n\n## Why\nx\n',
      ...archiveAt('2026-01-01-other'),
    });
    expect(
      r.issues.some(
        (i) => i.level === 'ERROR' && i.message.includes('references unknown change: ghost'),
      ),
    ).toBe(true);
  });

  test('archived YYYY-MM-DD-<id> entry satisfies depends_on with no issue', () => {
    const r = run({
      './llmanspec/changes/demo/proposal.md': '---\ndepends_on: [other]\n---\n\n## Why\nx\n',
      ...archiveAt('2026-01-01-other'),
    });
    expect(r.issues.some((i) => i.message.includes('references unknown change'))).toBe(false);
  });

  test('archived 2026-01-01-the-other must not suffix-match id other', () => {
    const r = run({
      './llmanspec/changes/demo/proposal.md': '---\ndepends_on: [other]\n---\n\n## Why\nx\n',
      ...archiveAt('2026-01-01-the-other'),
    });
    expect(r.issues.some((i) => i.message.includes('references unknown change: other'))).toBe(true);
  });

  test('blocks references go through the same resolution', () => {
    const r = run({
      './llmanspec/changes/demo/proposal.md':
        '---\ndepends_on: []\nblocks: [ghost]\n---\n\n## Why\nx\n',
      ...archiveAt('2026-01-01-other'),
    });
    expect(r.issues.some((i) => i.message.includes('references unknown change: ghost'))).toBe(true);
  });

  test('flat frozen card <YYYY-MM-DD>-<id>.yaml satisfies depends_on (r73 extension)', () => {
    const r = run({
      './llmanspec/changes/demo/proposal.md': '---\ndepends_on: [flat]\n---\n\n## Why\nx\n',
      './llmanspec/changes/archive/2026-01-02-flat.yaml': '---\ndepends_on: []\n---\n',
    });
    expect(r.issues.some((i) => i.message.includes('references unknown change'))).toBe(false);
  });

  test('frozen card 2026-01-01-the-other.yaml must not suffix-match id other', () => {
    const r = run({
      './llmanspec/changes/demo/proposal.md': '---\ndepends_on: [other]\n---\n\n## Why\nx\n',
      './llmanspec/changes/archive/2026-01-01-the-other.yaml': '---\ndepends_on: []\n---\n',
    });
    expect(r.issues.some((i) => i.message.includes('references unknown change: other'))).toBe(true);
  });
});

describe('r87: global change-id uniqueness gate', () => {
  /** Same path convention as the T2 fixture: `./` prefixes, dirs derived. */
  const makeIo = (files: Record<string, string>): ChangeFsIoLite => {
    const dirs = new Set<string>();
    for (const f of Object.keys(files)) {
      const parts = f.split('/');
      parts.pop();
      while (parts.length > 0) {
        dirs.add(parts.join('/'));
        parts.pop();
      }
    }
    return {
      exists: (p) => files[p] !== undefined || dirs.has(p),
      readText: (p) => {
        const v = files[p];
        if (v === undefined) throw new Error(`missing ${p}`);
        return v;
      },
      listDir: (p) => [
        ...new Set(
          [...Object.keys(files), ...dirs]
            .filter((e) => e.startsWith(`${p}/`))
            .map((e) => e.slice(p.length + 1).split('/')[0] as string),
        ),
      ],
      isDirectory: (p) => dirs.has(p),
    };
  };
  const proposal = (deps: string): string => `---\ndepends_on: ${deps}\n---\nx\n`;

  test('active ↔ archived dir collision is reported', () => {
    const dups = checkGlobalChangeIdUniqueness(
      makeIo({
        './llmanspec/changes/demo/proposal.md': proposal('[]'),
        './llmanspec/changes/archive/2026-01-01-demo/proposal.md': proposal('[]'),
      }),
      './llmanspec/changes',
    );
    expect(dups).toEqual(['demo']);
  });

  test('active ↔ frozen card collision is reported', () => {
    const dups = checkGlobalChangeIdUniqueness(
      makeIo({
        './llmanspec/changes/flat/proposal.md': proposal('[]'),
        './llmanspec/changes/archive/2026-01-02-flat.yaml': proposal('[]'),
      }),
      './llmanspec/changes',
    );
    expect(dups).toContain('flat');
  });

  test('unique ids are not reported', () => {
    expect(
      checkGlobalChangeIdUniqueness(
        makeIo({
          './llmanspec/changes/demo/proposal.md': proposal('[]'),
          './llmanspec/changes/other/proposal.md': proposal('[]'),
        }),
        './llmanspec/changes',
      ),
    ).toEqual([]);
  });
});

describe('T9: pattern compile defense (D8)', () => {
  test("invalid change_id.pattern via direct core call → ERROR 'change_id.pattern is not a valid regular expression'", () => {
    // NOT via the CLI: loadConfig compiles the pattern at load time, so the
    // defensive branch is only reachable by constructing ChangeCheckConfig
    // directly (parallel change harden-core-purity-config made CLI fail early).
    const files: Record<string, string> = {
      './llmanspec/changes/demo/proposal.md': '---\ndepends_on: []\n---\n\n## Why\nx\n',
    };
    const io: ChangeFsIoLite = {
      exists: (p) => files[p] !== undefined,
      readText: (p) => {
        const v = files[p];
        if (v === undefined) throw new Error(`missing ${p}`);
        return v;
      },
      listDir: (): string[] => [],
      isDirectory: (): boolean => false,
    };
    const r = validateChange(io, '.', 'demo', { change_id_pattern: '[unclosed' }, {});
    const hit = r.issues.find((i) => i.path === 'change-id');
    expect(hit?.level).toBe('ERROR');
    expect(hit?.message).toStartWith('change_id.pattern is not a valid regular expression');
  });
});

describe('feature-level top-level scenarios (orphan concept removed)', () => {
  test('top-level scenario not enclosed by a rule stays valid with no warning', () => {
    // 孤儿概念已废除:顶层场景(Gherkin 功能级示例)不产生任何 WARNING/信号。
    const spec = `# language: zh-CN
# capability: orphan
# purpose: p
# scope: llmanspec/

功能: orphan

  场景: 孤儿场景
    假如 a
    当 b
    那么 c

  @req:r1
  规则: 规则
    系统 MUST x

    场景: 挂回的验收
      假如 a2
      当 b2
      那么 c2
`;
    const entries: SpecEntry[] = [
      { fileName: 'llmanspec/specs/orphan.feature', doc: parseCapability(spec, 'orphan.feature') },
    ];
    const specIo = {
      exists: (p: string) => p === 'llmanspec/' || p.startsWith('llmanspec/specs'),
      isDirectory: (p: string) => p === 'llmanspec/',
      listDir: (p: string) =>
        p === 'llmanspec/specs' || p === 'llmanspec/specs/' ? ['orphan.feature'] : [],
      readText: (): string => spec,
    };
    const report = validateAllSpecs(entries, specIo);
    const items = report.verdicts.flatMap((v) => v.items);
    const orphanWarn = items.find((i) => i.level === 'WARNING' && i.message.includes('orphan'));
    expect(orphanWarn).toBeUndefined();
    expect(report.failed).toBe(false);
  });

  test('scenario nested in a rule produces no orphan WARNING', () => {
    const spec = `# language: zh-CN
# capability: clean
# purpose: p
# scope: llmanspec/

功能: clean

  @req:r1
  规则: 规则
    系统 MUST x

    场景: 挂回的验收
      假如 a2
      当 b2
      那么 c2
`;
    const entries: SpecEntry[] = [
      { fileName: 'llmanspec/specs/clean.feature', doc: parseCapability(spec, 'clean.feature') },
    ];
    const specIo = {
      exists: (p: string) => p === 'llmanspec/' || p.startsWith('llmanspec/specs'),
      isDirectory: (p: string) => p === 'llmanspec/',
      listDir: (p: string) =>
        p === 'llmanspec/specs' || p === 'llmanspec/specs/' ? ['clean.feature'] : [],
      readText: (): string => spec,
    };
    const report = validateAllSpecs(entries, specIo);
    const items = report.verdicts.flatMap((v) => v.items);
    expect(items.some((i) => i.level === 'WARNING' && i.message.includes('orphan scenario'))).toBe(
      false,
    );
    expect(report.failed).toBe(false);
  });
});
