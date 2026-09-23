import { describe, expect, test } from 'bun:test';

import {
  checkChangeDoc,
  discoverSpecs,
  parseCapability,
  validateAllSpecs,
  validateChange,
  type DiscoveryIo,
  type SpecEntry,
} from '@llman-sdd/core';

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
      `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n\n  @req:${req} @human\n  场景: ok\n    - 系统 MUST x\n`;
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

describe('validateAllSpecs', () => {
  test('clean specs pass with v1-style report lines', () => {
    const entries: SpecEntry[] = [
      { fileName: 'a.feature', doc: parseCapability(io.readText('a.feature'), 'a.feature') },
    ];
    const report = validateAllSpecs(entries, io);
    expect(report.failed).toBe(false);
    expect(report.lines.at(-1)).toBe('Totals: 1 passed, 0 failed (1 items)');
    expect(report.lines[0]).toBe('OK spec/a');
  });

  test('@human without MUST word fails (v1 parity)', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: t\n# purpose: p\n# scope: llmanspec/\n\n功能: t\n\n  @req:r1 @human\n  场景: ok\n    - 系统提供 x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(true);
    expect(report.lines).toContain('FAIL spec/t');
    expect(report.lines.join('\n')).toInclude('constraint statement must contain MUST/SHALL');
  });

  test('@human without @req tag fails (v1 parity)', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: t\n# purpose: p\n# scope: llmanspec/\n\n功能: t\n\n  @human\n  场景: ok\n    - 系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.lines.join('\n')).toInclude(
      '@human constraint scenario must carry an @req:<req_id> tag',
    );
  });

  test('valid_scope missing on disk fails', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: t\n# purpose: p\n# scope: nope/\n\n功能: t\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.lines.join('\n')).toInclude('valid_scope path(s) do not exist on disk: nope/');
  });

  test('duplicate req ids fail every involved capability', () => {
    const mk = (cap: string): SpecEntry => ({
      fileName: `${cap}.feature`,
      doc: parseCapability(
        `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n\n  @req:r9 @human\n  场景: ok\n    - 系统 MUST x\n`,
        `${cap}.feature`,
      ),
    });
    const report = validateAllSpecs([mk('a'), mk('b')], io);
    expect(report.lines[0]).toBe('FAIL spec/a');
    expect(report.lines.filter((l) => l === 'FAIL spec/b')).toHaveLength(1);
    expect(report.lines.at(-1)).toBe('Totals: 0 passed, 2 failed (2 items)');
  });

  test('missing capability header fails (v1 short-circuit); missing purpose is ERROR', () => {
    const doc = parseCapability(
      `# scope: llmanspec/\n\n功能: t\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(true);
    const joined = report.lines.join('\n');
    // v1 parity: missing capability short-circuits to file + registry issues.
    expect(joined).toInclude('missing `# capability:` header comment (spec-format r133)');

    const withCap = parseCapability(
      `# capability: t\n# scope: llmanspec/\n\n功能: t\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n`,
    );
    const report2 = validateAllSpecs([{ fileName: 't.feature', doc: withCap }], io);
    const joined2 = report2.lines.join('\n');
    // v1 parity: missing/empty purpose is an ERROR at `{cap}/purpose`.
    expect(joined2).toInclude(
      '[ERROR] t/purpose: `# purpose:` header comment must not be empty (spec-format r133)',
    );
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

  test('ratio gate and stage gate produce ERROR', () => {
    const r = checkChangeDoc({ ...BASE, completedTasks: 1 }, { min_completion_ratio: 1 });
    expect(r.valid).toBe(false);
    const g = checkChangeDoc({ ...BASE, stage: 'draft' }, {}, { stage: 'full' });
    expect(g.issues.some((i) => i.message.includes('below the required'))).toBe(true);
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

  const config = { strict_defer: null, min_completion_ratio: null, change_id_pattern: null };
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

describe('orphan acceptance WARNING (r65)', () => {
  test('acceptance scenario without @req reports WARNING', () => {
    const spec = `# language: zh-CN
# capability: orphan
# purpose: p
# scope: llmanspec/

功能: orphan

  @req:r1 @human
  场景: 规则
    - 系统 MUST x

  @executable
  场景: 孤儿验收
    假如 a
    当 b
    那么 c
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
    const orphan = items.find((i) => i.level === 'WARNING' && i.id.includes('/acceptance/'));
    expect(orphan?.message).toContain('orphan acceptance scenario');
  });
});
