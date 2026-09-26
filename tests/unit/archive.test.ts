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
  parseFrozenCard,
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

  test('freeze writes a flat card with frontmatter and replaces the dir', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'proposal.md'), '---\ndepends_on: [other]\n---\n\n# demo\n');
    writeFileSync(join(src, 'design.md'), '# d\n');
    const sz = await makeWasmSevenZip(deps());

    const freeze = await runFreeze(io(), sz, DIR, {});
    expect(freeze.candidates).toEqual(['2026-01-01-demo']);

    // Dir replaced by card; bodies inside the 7z.
    const archiveDir = join(DIR, 'llmanspec', 'changes', 'archive');
    expect(existsSync(join(archiveDir, '2026-01-01-demo'))).toBe(false);
    expect(isFrozenCard('2026-01-01-demo.yaml')).toBe(true);
    const cardText = readFileSync(join(archiveDir, '2026-01-01-demo.yaml'), 'utf8');
    const card = parseFrozenCard(cardText);
    expect(card).not.toBeNull();
    expect(card?.frontmatter).toContain('depends_on: [other]');
    expect(card?.frozen?.archive).toBe('freezed_changes.7z.archived');
    expect(card?.frozen?.files.some((f) => f.path === 'proposal.md')).toBe(true);
    expect(card?.frozen?.files.some((f) => f.path === 'design.md')).toBe(true);
    for (const f of card?.frozen?.files ?? []) {
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/u);
    }

    // --list derives entries from cards without parsing the 7z.
    const lines = await runList(io(), sz, DIR);
    expect(lines.join('\n')).toContain('2026-01-01-demo');
  });

  test('thaw restores bodies, verifies sha256, and removes the card', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'proposal.md'), '---\ndepends_on: []\n---\n\n# demo\n');
    const sz = await makeWasmSevenZip(deps());
    await runFreeze(io(), sz, DIR, {});

    const thaw = await runThaw(io(), sz, DIR, ['2026-01-01-demo']);
    expect(thaw.restored).toEqual(['2026-01-01-demo']);

    const archiveDir = join(DIR, 'llmanspec', 'changes', 'archive');
    expect(existsSync(join(archiveDir, '2026-01-01-demo', 'proposal.md'))).toBe(true);
    expect(readFileSync(join(archiveDir, '2026-01-01-demo', 'proposal.md'), 'utf8')).toContain(
      '# demo',
    );
    expect(existsSync(join(archiveDir, '2026-01-01-demo.yaml'))).toBe(false);
  });

  test('thaw rejects a tampered body by sha256 mismatch', async () => {
    rmSync(DIR, { recursive: true, force: true });
    const src = join(DIR, 'llmanspec', 'changes', 'archive', '2026-01-01-demo');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'proposal.md'), '---\ndepends_on: []\n---\n\n# demo\n');
    const sz = await makeWasmSevenZip(deps());
    await runFreeze(io(), sz, DIR, {});

    // Corrupt the cold-backup entry after freeze (simulated by patching the
    // extracted tmp copy — tamper the source archive by re-adding a changed
    // file under the same name).
    const archiveAbs = join(DIR, 'llmanspec', 'changes', 'archive', 'freezed_changes.7z.archived');
    const changed = join(DIR, 'changed', '2026-01-01-demo');
    mkdirSync(changed, { recursive: true });
    writeFileSync(join(changed, 'proposal.md'), '---\ndepends_on: []\n---\n\n# tampered\n');
    await sz.add(archiveAbs, join(DIR, 'changed'), ['2026-01-01-demo']);

    expect(runThaw(io(), sz, DIR, ['2026-01-01-demo'])).rejects.toThrow(/sha256 mismatch/u);
  });
});

describe('freezeCandidates', () => {
  const mkIo = (entries: string[]): FreezeIo => ({
    exists: () => true,
    listDir: () => entries,
    isDirectory: (p: string) => !p.endsWith('.yaml') && !p.endsWith('.7z.archived'),
    readText: () => '',
    writeText: () => {},
    now: () => new Date(),
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
