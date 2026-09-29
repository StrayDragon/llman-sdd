import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  discoverRoots,
  isValidRoot,
  resolveInstanceRoot,
  scopeCrossings,
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

describe('scopeCrossings (r92 single ownership)', () => {
  const others = [{ rootDir: '/w/packages/tui', llmanspecDir: '/w/packages/tui/llmanspec' }];

  test('scope reaching into a sub-root instance crosses', () => {
    expect(scopeCrossings(['packages/tui/', 'src/'], '/w', others)).toEqual([
      { scope: 'packages/tui/', rootDir: '/w/packages/tui' },
    ]);
  });

  test('sub-root scoping its own tree and unrelated roots never cross', () => {
    expect(scopeCrossings(['tests/', 'src/'], '/w/packages/tui', others)).toEqual([]);
    const elsewhere = [{ rootDir: '/other', llmanspecDir: '/other/llmanspec' }];
    expect(scopeCrossings(['packages/tui/'], '/w', elsewhere)).toEqual([]);
  });

  test('ancestor roots are exempt: a sub-root under them never self-crosses', () => {
    const repoRoot = [{ rootDir: '/w', llmanspecDir: '/w/llmanspec' }];
    // The sub instance scoping its own subtree resolves under the ancestor's
    // directory — ownership there belongs to the descendant, never a crossing.
    expect(scopeCrossings(['tests/', 'src/'], '/w/packages/tui', repoRoot)).toEqual([]);
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
