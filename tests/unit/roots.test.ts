import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  collectChangeIdValues,
  computeCrossRootCollisions,
  discoverRoots,
  isValidRoot,
  resolveInstanceRoot,
  type ChangeFsIoLite,
  type RootsIo,
} from '@llman-sdd/core';

import { initGitRepo, runCli } from '../helpers/spawn.ts';

/** Filesystem-shaped RootsIo from a list of dirs and files. */
function ioFrom(dirs: string[], files: string[]): RootsIo {
  const dirSet = new Set(dirs);
  return {
    exists: (p) => dirSet.has(p) || files.includes(p),
    isDirectory: (p) => dirSet.has(p),
    listDir: (p) =>
      [...dirSet, ...files]
        .filter((p2) => p2.startsWith(`${p}/`))
        .map((p2) => p2.slice(p.length + 1).split('/')[0])
        .filter((n): n is string => n !== undefined && n !== '')
        .toSorted()
        .filter((n, i, a) => a.indexOf(n) === i),
  };
}

describe('isValidRoot', () => {
  test('requires config.yaml or specs/ inside llmanspec/', () => {
    const io = ioFrom(['/r/llmanspec'], ['/r/llmanspec/config.yaml']);
    expect(isValidRoot('/r/llmanspec', io)).toBe(true);
    const bare = ioFrom(['/r2/llmanspec'], []);
    expect(isValidRoot('/r2/llmanspec', bare)).toBe(false);
  });
});

describe('discoverRoots', () => {
  test('repo root is depth 0 and subpackage roots are found; excluded dirs pruned', () => {
    const dirs = [
      '/w/llmanspec',
      '/w/llmanspec/specs',
      '/w/packages',
      '/w/packages/xylitol-tui',
      '/w/packages/xylitol-tui/llmanspec',
      '/w/packages/xylitol-tui/llmanspec/specs',
      '/w/packages/xylitol-tui/node_modules/llmanspec',
      '/w/target/llmanspec',
    ];
    const files = [
      '/w/llmanspec/config.yaml',
      '/w/packages/xylitol-tui/llmanspec/config.yaml',
      '/w/packages/xylitol-tui/node_modules/llmanspec/config.yaml',
      '/w/target/llmanspec/config.yaml',
    ];
    const roots = discoverRoots('/w', ioFrom(dirs, files));
    expect(roots.map((r) => r.rootDir)).toEqual(['/w', '/w/packages/xylitol-tui']);
  });

  test('maxDepth caps the scan depth', () => {
    const dirs = ['/w/a', '/w/a/b', '/w/a/b/c', '/w/a/b/c/llmanspec', '/w/a/b/c/llmanspec/specs'];
    expect(discoverRoots('/w', ioFrom(dirs, []), { maxDepth: 2 })).toEqual([]);
    expect(discoverRoots('/w', ioFrom(dirs, []), { maxDepth: 4 }).map((r) => r.rootDir)).toEqual([
      '/w/a/b/c',
    ]);
  });
});

describe('resolveInstanceRoot (r94 per-root helpers)', () => {
  test('nearest ancestor wins; null when none carries a root', () => {
    const dirs = ['/w/llmanspec', '/w/packages/tui/llmanspec'];
    const io = ioFrom(dirs, ['/w/llmanspec/config.yaml', '/w/packages/tui/llmanspec/config.yaml']);
    expect(resolveInstanceRoot('/w', io)).toBe('/w');
    expect(resolveInstanceRoot('/w/packages/tui', io)).toBe('/w/packages/tui');
    expect(resolveInstanceRoot('/w/packages/tui/src', io)).toBe('/w/packages/tui');
    expect(resolveInstanceRoot('/nowhere', io)).toBe(null);
  });
});

describe('single-root backward compatibility (r91 iron rule)', () => {
  test('validate --specs on a lone root carries no roots dimension', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-srcompat-'));
    initGitRepo(root);
    mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
    writeFileSync(
      join(root, 'llmanspec', 'specs', 'solo.feature'),
      '# language: zh-CN\n# capability: solo\n# purpose: p\n# scope: src/\n\n功能: solo\n\n  @req:r1\n  规则: 唯一根规则\n    系统 MUST x\n',
    );
    for (const args of [
      ['add', '-A'],
      ['commit', '-qm', 'init'],
    ]) {
      spawnSync('git', args, { cwd: root });
    }
    const proc = runCli(['validate', '--specs', '--json'], root);
    expect(proc.status).toBe(0);
    const parsed = JSON.parse(proc.stdout ?? '{}') as { roots?: unknown; items?: unknown[] };
    // no aggregate wrapper on the single-root path — legacy shape verbatim
    expect(parsed.roots).toBeUndefined();
    expect(parsed.items?.length).toBe(1);
  });
});

/** In-memory change-tree IO (ChangeFsIoLite) for the r87 id-domain helper. */
function changeIoFrom(dirs: string[], files: string[]): ChangeFsIoLite {
  const listDir = (p: string): string[] =>
    [...dirs, ...files]
      .filter((p2) => p2.startsWith(`${p}/`))
      .map((p2) => p2.slice(p.length + 1).split('/')[0])
      .filter((n): n is string => n !== undefined && n !== '')
      .toSorted()
      .filter((n, i, a) => a.indexOf(n) === i);
  return {
    exists: (p) => dirs.includes(p) || files.includes(p),
    readText: () => '',
    listDir,
    isDirectory: (p) => dirs.includes(p),
  };
}

describe('collectChangeIdValues (r87/r91 change-id domain)', () => {
  test('active leaf names plus archived dir/card base ids, deduped and sorted', () => {
    const dirs = [
      '/r/llmanspec/changes',
      '/r/llmanspec/changes/demo',
      '/r/llmanspec/changes/archive',
      '/r/llmanspec/changes/archive/2026-01-01-old',
    ];
    const files = [
      '/r/llmanspec/changes/demo/proposal.md',
      '/r/llmanspec/changes/archive/2026-01-01-old/proposal.md',
      '/r/llmanspec/changes/archive/2026-02-02-card.yaml',
    ];
    expect(collectChangeIdValues(changeIoFrom(dirs, files), '/r/llmanspec/changes')).toEqual([
      'card',
      'demo',
      'old',
    ]);
  });
});

describe('computeCrossRootCollisions (r91 shape / r114 observation)', () => {
  test('all three namespaces; sorted by namespace then value, roots by relative path', () => {
    expect(
      computeCrossRootCollisions([
        {
          root: 'packages/tui',
          specIds: ['shared', 'tui-only'],
          reqIds: ['r9', 'r1'],
          changeIds: ['demo', 'tui-only'],
        },
        {
          root: '.',
          specIds: ['shared', 'root-only'],
          reqIds: ['r9', 'r1'],
          changeIds: ['demo'],
        },
      ]),
    ).toEqual([
      { namespace: 'spec', value: 'shared', roots: ['.', 'packages/tui'] },
      { namespace: 'req', value: 'r1', roots: ['.', 'packages/tui'] },
      { namespace: 'req', value: 'r9', roots: ['.', 'packages/tui'] },
      { namespace: 'change', value: 'demo', roots: ['.', 'packages/tui'] },
    ]);
  });

  test('single root returns undefined — the field must never be emitted (not even [])', () => {
    expect(
      computeCrossRootCollisions([
        { root: '.', specIds: ['solo'], reqIds: ['r1'], changeIds: ['demo'] },
      ]),
    ).toBeUndefined();
    expect(computeCrossRootCollisions([])).toBeUndefined();
  });

  test('two roots without overlap yield an empty array (field present, count 0)', () => {
    expect(
      computeCrossRootCollisions([
        { root: '.', specIds: ['a'], reqIds: ['r1'], changeIds: [] },
        { root: 'packages/tui', specIds: ['b'], reqIds: ['r2'], changeIds: ['c'] },
      ]),
    ).toEqual([]);
  });

  test('in-root duplicates collapse; input order does not affect the result', () => {
    const a = {
      root: '.',
      specIds: ['dup', 'dup'],
      reqIds: ['r1', 'r1'],
      changeIds: [],
    };
    const b = { root: 'packages/tui', specIds: ['dup'], reqIds: ['r1'], changeIds: [] };
    const forward = computeCrossRootCollisions([a, b]);
    const reversed = computeCrossRootCollisions([b, a]);
    expect(forward).toEqual([
      { namespace: 'spec', value: 'dup', roots: ['.', 'packages/tui'] },
      { namespace: 'req', value: 'r1', roots: ['.', 'packages/tui'] },
    ]);
    expect(reversed).toEqual(forward);
  });
});

describe('single-root --all-roots byte lock (r91 iron rule)', () => {
  const makeSoloRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'llman-allroots-'));
    initGitRepo(root);
    mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
    writeFileSync(
      join(root, 'llmanspec', 'specs', 'solo.feature'),
      '# language: zh-CN\n# capability: solo\n# purpose: p\n# scope: src/\n\n功能: solo\n\n  @req:r1\n  规则: 唯一根规则\n    系统 MUST x\n',
    );
    for (const args of [
      ['add', '-A'],
      ['commit', '-qm', 'init'],
    ]) {
      spawnSync('git', args, { cwd: root });
    }
    return root;
  };

  test('human output is unchanged: no observation section, no hint line', () => {
    const proc = runCli(['validate', '--all-roots', '--output', 'human'], makeSoloRoot());
    expect(proc.status).toBe(0);
    expect(proc.stdout).toBe('root .\nOK spec/solo\nTotals: 1 passed, 0 failed (1 items)\n');
    expect(proc.stderr ?? '').not.toContain('--directory');
  });

  test('machine output carries no crossRootCollisions field at all', () => {
    const proc = runCli(['validate', '--all-roots'], makeSoloRoot());
    expect(proc.status).toBe(0);
    expect(proc.stdout ?? '').not.toContain('crossRootCollisions');
    const parsed = JSON.parse(
      // default output is TOON; --json is the byte-stable machine alias
      runCli(['validate', '--all-roots', '--json'], makeSoloRoot()).stdout ?? '{}',
    ) as { summary?: Record<string, unknown>; crossRootCollisions?: unknown };
    expect(parsed.crossRootCollisions).toBeUndefined();
    expect(parsed.summary).toEqual({ totals: { items: 1, passed: 1, failed: 0 } });
  });
});

describe('cross-root observation exit-code neutrality (r114)', () => {
  const SPEC = (scope: string, title: string): string =>
    `# language: zh-CN\n# capability: shared\n# purpose: p\n# scope: ${scope}\n\n功能: shared\n\n  @req:r1\n  规则: ${title}\n    系统 MUST x\n`;

  /** Two roots sharing spec `shared`/req `r1`/change `demo`; `red` adds a duplicate req id in the sub-root. */
  const makeCollidingRoots = (red: boolean): string => {
    const root = mkdtempSync(join(tmpdir(), 'llman-xroot-'));
    initGitRepo(root);
    const sub = join(root, 'packages', 'tui', 'llmanspec');
    for (const dir of [
      join(root, 'llmanspec', 'specs'),
      join(root, 'llmanspec', 'changes', 'demo'),
      join(sub, 'specs'),
      join(sub, 'changes', 'demo'),
    ]) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
    writeFileSync(join(sub, 'config.yaml'), 'schema: spec-driven\n');
    writeFileSync(join(root, 'llmanspec', 'specs', 'shared.feature'), SPEC('src/', '根侧规则'));
    writeFileSync(join(sub, 'specs', 'shared.feature'), SPEC('tests/', '子侧规则'));
    if (red) {
      writeFileSync(
        join(sub, 'specs', 'dupe.feature'),
        '# language: zh-CN\n# capability: dupe\n# purpose: p\n# scope: tests/\n\n功能: dupe\n\n  @req:r1\n  规则: 子根重复号\n    系统 MUST z\n',
      );
    }
    for (const [dir, title] of [
      [join(root, 'llmanspec', 'changes', 'demo'), '根侧样例'],
      [join(sub, 'changes', 'demo'), '子侧样例'],
    ] as const) {
      writeFileSync(
        join(dir, 'proposal.md'),
        `---\ndepends_on: []\ntitle: ${title}\n---\n\n## Why\nx\n`,
      );
    }
    for (const args of [
      ['add', '-A'],
      ['commit', '-qm', 'init'],
    ]) {
      spawnSync('git', args, { cwd: root });
    }
    return root;
  };

  test('collisions alone keep exit 0; human section ends with the --directory hint', () => {
    const proc = runCli(
      ['validate', '--all-roots', '--output', 'human'],
      makeCollidingRoots(false),
    );
    expect(proc.status).toBe(0);
    expect(proc.stdout).toContain('Cross-root id collisions');
    expect(proc.stdout).toContain('spec/shared: ., packages/tui');
    expect(proc.stdout).toContain('req/r1: ., packages/tui');
    expect(proc.stdout).toContain('change/demo: ., packages/tui');
    expect(
      proc.stdout
        ?.trimEnd()
        .endsWith(
          'Use --directory <path> to target one instance root; collisions never affect the exit code.',
        ),
    ).toBe(true);
  });

  test('a red root still exits non-zero while collisions stay reported (machine, no hint)', () => {
    const proc = runCli(['validate', '--all-roots', '--json'], makeCollidingRoots(true));
    expect(proc.status).toBe(1);
    expect(proc.stdout ?? '').not.toContain('Use --directory');
    const parsed = JSON.parse(proc.stdout ?? '{}') as {
      crossRootCollisions?: { namespace: string }[];
      summary?: { crossRootCollisions?: number };
    };
    expect(parsed.crossRootCollisions?.length).toBe(3);
    expect(parsed.summary?.crossRootCollisions).toBe(3);
  });
});
