import { describe, expect, test } from 'bun:test';
// r120 freeze content filter — pure-layered gitignore evaluation matrix for
// archive/ignoreChain.ts (review-freeze capability). Fixtures are throwaway
// temp trees driven through the injected io (core purity preserved).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IgnoreChainError, collectFilteredEntries, discoverIgnoreRoot } from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';

function setup(prefix: string): { root: string; io: ReturnType<typeof makeNodeIo> } {
  const root = mkdtempSync(join(tmpdir(), `llman-sdd-ignore-${prefix}-`));
  return { root, io: makeNodeIo(root) };
}

function put(root: string, rel: string, content = 'x\n'): string {
  const full = join(root, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function collect(
  root: string,
  candidateRel: string,
  userIgnoreFiles: string[] = [],
): { files: string[]; excluded: number } {
  return collectFilteredEntries(makeNodeIo(root), {
    rootAbs: root,
    candidateAbs: join(root, candidateRel),
    userIgnoreFiles,
  });
}

describe('discoverIgnoreRoot', () => {
  test('nearest .git ancestor wins (worktree file counts)', () => {
    const { root, io } = setup('root-git');
    const instance = join(root, 'sub', 'llmanspec');
    mkdirSync(join(instance, 'specs'), { recursive: true });
    writeFileSync(join(root, '.git'), 'gitdir: ../elsewhere\n');
    expect(discoverIgnoreRoot(io, instance)).toBe(root);
  });

  test('no .git anywhere falls back to the instance root', () => {
    const { root, io } = setup('root-nogit');
    const instance = join(root, 'llmanspec');
    expect(discoverIgnoreRoot(io, instance)).toBe(instance);
  });
});

describe('collectFilteredEntries', () => {
  test('nested .gitignore beats outer layers; anchoring is per-layer', () => {
    const { root } = setup('layered');
    put(root, '.gitignore', 'node_modules/\n');
    const c = 'llmanspec/changes/archive/2026-01-01-demo';
    put(root, `${c}/proposal.md`, '# p\n');
    put(root, `${c}/research/poc/.gitignore`, '/target\n');
    put(root, `${c}/research/poc/target/debug/a.so`, 'bin');
    put(root, `${c}/research/poc/keep.md`, 'k\n');
    put(root, `${c}/node_modules/pkg/index.js`, 'j\n');
    const { files, excluded } = collect(root, c);
    expect(files).toEqual(['proposal.md', 'research/poc/.gitignore', 'research/poc/keep.md']);
    expect(excluded).toBe(2); // a.so + node_modules/pkg/index.js
  });

  test('! re-inclusion within one file (last match wins)', () => {
    const { root } = setup('negation');
    put(root, '.gitignore', '*.bin\n!keep.bin\n');
    const c = 'llmanspec/changes/archive/2026-02-01-demo';
    put(root, `${c}/drop.bin`);
    put(root, `${c}/keep.bin`);
    const { files, excluded } = collect(root, c);
    expect(files).toContain('keep.bin');
    expect(files).not.toContain('drop.bin');
    expect(excluded).toBe(1);
  });

  test('trailing-slash dir pattern ignores the directory, not a same-named file', () => {
    const { root } = setup('dirslash');
    put(root, '.gitignore', 'build/\n');
    const c = 'llmanspec/changes/archive/2026-03-01-demo';
    put(root, `${c}/build/out.o`);
    put(root, `${c}/sub/build`); // plain file named build — dir-only rule misses it
    const { files } = collect(root, c);
    expect(files).toContain('sub/build');
    expect(files).not.toContain('build/out.o');
  });

  test('** matches at any depth; .git is always pruned', () => {
    const { root } = setup('glob');
    put(root, '.gitignore', '**/logs\n');
    const c = 'llmanspec/changes/archive/2026-04-01-demo';
    put(root, `${c}/a/logs/l.txt`);
    put(root, `${c}/b/logs.txt`); // `**/logs` does not match logs.txt
    put(root, `${c}/keep.md`);
    put(root, `${c}/nested/.git/config`);
    const { files } = collect(root, c);
    expect(files).toEqual(['b/logs.txt', 'keep.md']);
  });

  test('user ignore file outranks .gitignore re-inclusion', () => {
    const { root } = setup('userfile');
    put(root, '.gitignore', '*.bin\n!*.bin\n'); // decisive un-ignore
    const extras = put(root, 'extras.gitignore', '*.bin\n');
    const c = 'llmanspec/changes/archive/2026-05-01-demo';
    put(root, `${c}/a.bin`);
    put(root, `${c}/b.md`);
    const { files, excluded } = collect(root, c, [extras]);
    expect(files).toEqual(['b.md']);
    expect(excluded).toBe(1);
    // without the extras file the re-inclusion keeps a.bin packable
    const plain = collect(root, c);
    expect(plain.files).toContain('a.bin');
  });

  test('nonexistent user ignore file fails fast', () => {
    const { root } = setup('missing');
    const c = 'llmanspec/changes/archive/2026-06-01-demo';
    put(root, `${c}/proposal.md`);
    expect(() => collect(root, c, [join(root, 'nope.gitignore')])).toThrow(IgnoreChainError);
  });

  test('fully ignored candidate yields zero files (freeze-level guard input)', () => {
    const { root } = setup('empty');
    put(root, '.gitignore', '**\n');
    const c = 'llmanspec/changes/archive/2026-07-01-demo';
    put(root, `${c}/proposal.md`);
    const { files } = collect(root, c);
    expect(files).toEqual([]);
  });

  test('no ignore sources keeps the legacy full pack', () => {
    const { root } = setup('legacy');
    const c = 'llmanspec/changes/archive/2026-08-01-demo';
    put(root, `${c}/proposal.md`);
    put(root, `${c}/target/debug/a.so`, 'bin');
    const { files, excluded } = collect(root, c);
    expect(files).toEqual(['proposal.md', 'target/debug/a.so']);
    expect(excluded).toBe(0);
  });
});
