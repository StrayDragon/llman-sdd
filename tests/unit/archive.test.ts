import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  makeWasmSevenZip,
  freezeCandidates,
  runFreeze,
  runList,
  runThaw,
  isFrozenCard,
  type FreezeIo,
  type WasmSevenZipDeps,
} from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';

const DIR = join(tmpdir(), 'llman-sdd-7z-test');

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

describe('freeze card flow against the real adapter', () => {
  const io = (): FreezeIo => ({ ...makeNodeIo(DIR) });

  test('freeze writes a flat relationship-index card (title + depends_on only) and replaces the dir', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo');
    mkdirSync(src, { recursive: true });
    writeFileSync(
      join(src, 'proposal.md'),
      '---\ndepends_on: [other]\n---\n\n# Demo Change\n\nbody\n',
    );
    writeFileSync(join(src, 'design.md'), '# d\n');
    const sz = await makeWasmSevenZip(deps());

    const freeze = await runFreeze(io(), sz, DIR, {});
    expect(freeze.candidates).toEqual(['2026-01-01-demo']);

    // Dir replaced by card; bodies inside the 7z.
    const archiveDir = join(DIR, 'llmanspec', 'changes', 'archive');
    expect(existsSync(join(archiveDir, '2026-01-01-demo'))).toBe(false);
    expect(isFrozenCard('2026-01-01-demo.yaml')).toBe(true);
    const cardText = readFileSync(join(archiveDir, '2026-01-01-demo.yaml'), 'utf8');
    // Title extracted from the proposal H1; depends_on preserved in flow form.
    expect(cardText).toContain('title: "Demo Change"');
    expect(cardText).toContain('depends_on: [other]');
    // No frozen section, no frontmatter transcription beyond depends_on.
    expect(cardText).not.toContain('frozen:');
    expect(cardText).not.toContain('branch:');
    expect(cardText).not.toContain('design.md');

    // --list derives entries from cards without parsing the 7z.
    const lines = await runList(io(), sz, DIR);
    expect(lines.join('\n')).toContain('2026-01-01-demo');
  });

  test('freeze omits depends_on when the proposal has none', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'proposal.md'), '---\ndepends_on: []\n---\n\n# Solo\n\nbody\n');
    const sz = await makeWasmSevenZip(deps());
    await runFreeze(io(), sz, DIR, {});

    const card = readFileSync(
      join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo.yaml'),
      'utf8',
    );
    expect(card).toContain('title: "Solo"');
    expect(card).toContain('depends_on: []');
  });

  test('freeze preserves multi-line flow depends_on as a single-line flow array', async () => {
    const frontmatter =
      'depends_on:\n  [\n    fix-lifecycle,\n    harden-core\n  ]\nneeds_specs_change: true';
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-multi');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'proposal.md'), `---\n${frontmatter}\n---\n\n# Multi\n\nbody\n`);
    const sz = await makeWasmSevenZip(deps());
    await runFreeze(io(), sz, DIR, {});

    const card = readFileSync(
      join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-multi.yaml'),
      'utf8',
    );
    expect(card).toContain('depends_on: [fix-lifecycle, harden-core]');
    expect(card).not.toContain('needs_specs_change');
  });

  test('thaw restores bodies and removes the card', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'proposal.md'), '---\ndepends_on: []\n---\n\n# Demo\n\nbody\n');
    writeFileSync(join(src, 'design.md'), '# d\n');
    const sz = await makeWasmSevenZip(deps());
    await runFreeze(io(), sz, DIR, {});

    const thaw = await runThaw(io(), sz, DIR, ['2026-01-01-demo']);
    expect(thaw.restored).toEqual(['2026-01-01-demo']);

    const archiveDir = join(DIR, 'llmanspec', 'changes', 'archive');
    expect(existsSync(join(archiveDir, '2026-01-01-demo', 'proposal.md'))).toBe(true);
    expect(readFileSync(join(archiveDir, '2026-01-01-demo', 'design.md'), 'utf8')).toBe('# d\n');
    expect(existsSync(join(archiveDir, '2026-01-01-demo.yaml'))).toBe(false);
  });

  test('thaw without a cold backup is rejected with a clear error', async () => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(join(DIR, 'llmanspec', 'changes', 'archive'), { recursive: true });
    const sz = await makeWasmSevenZip(deps());
    const error = await runThaw(io(), sz, DIR, ['2026-01-01-ghost']).then(
      () => '',
      (e: unknown) => (e as Error).message,
    );
    expect(error).toContain('freeze archive not found');
  });
});

describe('freezeCandidates', () => {
  const mkIo = (entries: string[]): FreezeIo => ({
    exists: () => true,
    listDir: () => entries,
    isDirectory: (p: string) => !p.endsWith('.yaml') && !p.endsWith('.7z.archived'),
    readText: () => '',
    writeText: () => {},
    remove: () => {},
    removeDir: () => {},
    mkdirp: () => {},
    moveDir: () => {},
  });
  const archiveDir = 'llmanspec/changes/archive';

  test('selects all dated dirs without filters', () => {
    expect(
      freezeCandidates(
        mkIo(['2026-01-01-old', '2026-02-01-mid', '2026-03-01-new']),
        archiveDir,
        {},
      ),
    ).toEqual(['2026-01-01-old', '2026-02-01-mid', '2026-03-01-new']);
  });
  test('excludes frozen cards and the archive file', () => {
    expect(
      freezeCandidates(
        mkIo(['2026-01-01-old', '2026-01-01-old.yaml', 'freezed_changes.7z.archived']),
        archiveDir,
        {},
      ),
    ).toEqual(['2026-01-01-old']);
  });
  test('--before is exclusive', () => {
    expect(
      freezeCandidates(mkIo(['2026-01-01-old', '2026-02-01-mid', '2026-03-01-new']), archiveDir, {
        before: '2026-02-01',
      }),
    ).toEqual(['2026-01-01-old']);
  });
  test('--keep-recent keeps newest N', () => {
    const entries = ['2026-01-01-old', '2026-02-01-mid', '2026-03-01-new'];
    expect(freezeCandidates(mkIo(entries), archiveDir, { keepRecent: 1 })).toEqual([
      '2026-01-01-old',
      '2026-02-01-mid',
    ]);
    expect(
      freezeCandidates(mkIo(entries), archiveDir, { before: '2026-04-01', keepRecent: 2 }),
    ).toEqual(['2026-01-01-old']);
  });
});
