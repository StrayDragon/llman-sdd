import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  makeWasmSevenZip,
  freezeCandidates,
  runFreeze,
  runList,
  type FreezeIo,
  type WasmSevenZipDeps,
} from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';

const DIR = '/tmp/llman-sdd-7z-test';

/** Disk-backed deps: wasm unset (glue loads from disk) + recursive mkdir. */
const deps = (): WasmSevenZipDeps => ({
  mkdirp: (dir) => mkdirSync(dir, { recursive: true }),
});

describe('7z adapter roundtrip', () => {
  test('add / list / extract keep structure and content', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'data', '2026-01-01-demo');
    mkdirSync(join(src, 'inner'), { recursive: true });
    writeFileSync(join(src, 'a.txt'), 'hello\n');
    writeFileSync(join(src, 'inner', 'b.md'), '# b\n');
    const sz = await makeWasmSevenZip(deps());

    const archive = join(DIR, 'freezed_changes.7z.archived');
    await sz.add(archive, join(DIR, 'data'), ['2026-01-01-demo']);

    const entries = await sz.listEntries(archive);
    expect(entries.some((e) => e.startsWith('2026-01-01-demo'))).toBe(true);

    const dest = join(DIR, 'restored');
    await sz.extractAll(archive, dest);
    expect(readFileSync(join(dest, '2026-01-01-demo', 'inner', 'b.md'), 'utf8')).toBe('# b\n');
    expect(existsSync(join(dest, '2026-01-01-demo', 'a.txt'))).toBe(true);
  });
});

describe('runList against the real adapter', () => {
  // Regression: real 7z lists file paths under their directory
  // (`<dir>/proposal.md`), never bare directory entries — the previous
  // `split('/').length === 1` filter made --list always report empty.
  test('derives dated change names from dir-prefixed entries', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'proposal.md'), '# demo\n');
    const io = { ...makeNodeIo(DIR), moveDir: renameSync };
    const sz = await makeWasmSevenZip(deps());
    const freeze = await runFreeze(io, sz, DIR, {});
    expect(freeze.candidates).toEqual(['2026-01-01-demo']);
    const lines = await runList(io, sz, DIR);
    expect(lines.join('\n')).toContain('2026-01-01-demo');
  });
});

describe('freezeCandidates', () => {
  const io: FreezeIo = {
    exists: () => true,
    listDir: () => [
      '2026-01-01-old',
      '2026-02-01-mid',
      '2026-03-01-new',
      'freezed_changes.7z.archived',
      'not-dated',
    ],
    removeDir: () => {},
    mkdirp: () => {},
    moveDir: () => {},
  };
  const archiveDir = 'llmanspec/changes/archive';

  test('selects all dated dirs without filters', () => {
    expect(freezeCandidates(io, archiveDir, {})).toEqual([
      '2026-01-01-old',
      '2026-02-01-mid',
      '2026-03-01-new',
    ]);
  });
  test('--before is exclusive', () => {
    expect(freezeCandidates(io, archiveDir, { before: '2026-02-01' })).toEqual(['2026-01-01-old']);
  });
  test('--keep-recent keeps newest N', () => {
    expect(freezeCandidates(io, archiveDir, { keepRecent: 1 })).toEqual([
      '2026-01-01-old',
      '2026-02-01-mid',
    ]);
    expect(freezeCandidates(io, archiveDir, { before: '2026-04-01', keepRecent: 2 })).toEqual([
      '2026-01-01-old',
    ]);
  });
});
