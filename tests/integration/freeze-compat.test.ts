import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeWasmSevenZip, runFreeze, runThaw, type FreezeIo } from '@llman-sdd/core';

const ROOT = join(tmpdir(), 'llman-sdd-freeze-compat');

function makeRoot(): string {
  rmSync(ROOT, { recursive: true, force: true });
  const archiveDir = join(ROOT, 'llmanspec', 'changes', 'archive');
  mkdirSync(archiveDir, { recursive: true });
  for (const name of ['2026-01-01-old-demo', '2026-02-01-kept']) {
    const dir = join(archiveDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'proposal.md'), `# ${name}\n`);
  }
  return ROOT;
}

function nodeIo(): FreezeIo {
  const full = (p: string): string => join(ROOT, p);
  return {
    exists: (p) => existsSync(full(p)),
    listDir: (p) => readdirSync(full(p)),
    removeDir: (p) => rmSync(full(p), { recursive: true, force: true }),
    mkdirp: (p) => mkdirSync(full(p), { recursive: true }),
    moveDir: (from, to) => {
      mkdirp(to.slice(0, to.lastIndexOf('/')));
      execFileSync('mv', [full(from), full(to)]);
    },
  };
}

function mkdirp(p: string): void {
  mkdirSync(p, { recursive: true });
}

describe('freeze/thaw bidirectional compatibility', () => {
  test('v1 freeze → v2 thaw restores dirs and content', async () => {
    makeRoot();
    execFileSync('llman', ['sdd', 'archive', 'freeze', '--before', '2026-02-01'], { cwd: ROOT });
    // v1 froze old-demo and removed it; kept must remain
    expect(existsSync(join(ROOT, 'llmanspec/changes/archive/2026-01-01-old-demo'))).toBe(false);
    expect(existsSync(join(ROOT, 'llmanspec/changes/archive/freezed_changes.7z.archived'))).toBe(
      true,
    );

    const sz = await makeWasmSevenZip();
    const result = await runThaw(nodeIo(), sz, ROOT, ['2026-01-01-old-demo']);
    expect(result.restored).toEqual(['2026-01-01-old-demo']);
    expect(
      readFileSync(join(ROOT, 'llmanspec/changes/archive/2026-01-01-old-demo/proposal.md'), 'utf8'),
    ).toBe('# 2026-01-01-old-demo\n');
  });

  test('v2 freeze → v1 thaw restores dirs and content', async () => {
    makeRoot();
    const sz = await makeWasmSevenZip();
    const result = await runFreeze(nodeIo(), sz, ROOT, { before: '2026-02-01' });
    expect(result.candidates).toEqual(['2026-01-01-old-demo']);
    expect(existsSync(join(ROOT, 'llmanspec/changes/archive/2026-01-01-old-demo'))).toBe(false);

    // 双向兼容合同:v1 能读取并解冻 v2 冻结的归档(v1 的 .thawed 暂存位置是它自己的实现细节)
    execFileSync('llman', ['sdd', 'archive', 'thaw', '--change', '2026-01-01-old-demo'], {
      cwd: ROOT,
    });
    const thawedAt = execFileSync('find', [join(ROOT, 'llmanspec'), '-name', 'proposal.md'], {
      encoding: 'utf8',
    });
    expect(thawedAt).toInclude('2026-01-01-old-demo');
    rmSync(join(ROOT, 'llmanspec/changes/archive/.thawed'), { recursive: true, force: true });
  });

  test('v2 thaw with unknown name errors listing available', async () => {
    makeRoot();
    execFileSync('llman', ['sdd', 'archive', 'freeze', '--before', '2026-02-01'], { cwd: ROOT });
    const sz = await makeWasmSevenZip();
    await expect(runThaw(nodeIo(), sz, ROOT, ['2026-09-09-nope'])).rejects.toThrow(
      /not found in freeze archive/,
    );
  });
});
