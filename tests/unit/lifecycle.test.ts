import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  archiveChange,
  archiveTaskGate,
  attachChange,
  changeDiffInfo,
  finalizeChange,
  startChange,
  deriveChangeId,
  extractUniqueNumber,
  harvestUniqueNumbers,
  makeSpawnGit,
  readBinding,
  writeBinding,
} from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';

/**
 * 临时 git 仓库工厂:在 main 分支上提交一个含 proposal.md(可选 tasks.md)的
 * change 目录,返回 root 与带仓库内身份(-c user.email/name)的 git 驱动,
 * 供各生命周期用例复用,避免每套用例手写一遍 init/commit 样板。
 */
const makeGitRepo = (
  changeId: string,
  opts: { tasks?: string; prefix?: string } = {},
): { root: string; run: (args: string[]) => ReturnType<typeof spawnSync> } => {
  const root = mkdtempSync(join(tmpdir(), opts.prefix ?? 'llman-lifecycle-'));
  const run = (args: string[]): ReturnType<typeof spawnSync> =>
    spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  run(['init', '-q', '-b', 'main']);
  const dir = join(root, 'llmanspec', 'changes', changeId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  if (opts.tasks !== undefined) writeFileSync(join(dir, 'tasks.md'), opts.tasks);
  run(['add', '-A']);
  run(['commit', '-qm', 'init']);
  return { root, run };
};

describe('frontmatter binding', () => {
  const WITH_COMMENTS = `---
# 生命周期由 llman 管理
depends_on: [] # 保持注释
---

## Why

body here
`;

  test('upsert preserves comments and other keys', () => {
    const out = writeBinding(WITH_COMMENTS, {
      branch: 'sdd/x',
      baseBranch: 'main',
      baseSha: 'abc123',
    });
    expect(out).toInclude('# 生命周期由 llman 管理');
    expect(out).toInclude('depends_on: [] # 保持注释');
    expect(out).toInclude('branch: sdd/x');
    expect(out).toInclude('base_branch: main');
    expect(out).toInclude('base_sha: abc123');
    expect(out.endsWith('body here\n')).toBe(true);
  });

  test('readBinding roundtrips', () => {
    const out = writeBinding(WITH_COMMENTS, {
      branch: 'sdd/y',
      baseBranch: 'main',
      baseSha: 'def456',
    });
    expect(readBinding(out)).toEqual({ branch: 'sdd/y', baseBranch: 'main', baseSha: 'def456' });
  });

  test('no frontmatter → binding block prepended', () => {
    const out = writeBinding('plain body\n', { branch: 'b', baseBranch: 'main', baseSha: 's' });
    expect(out.startsWith('---\n')).toBe(true);
    expect(readBinding(out)).toEqual({ branch: 'b', baseBranch: 'main', baseSha: 's' });
    expect(out.endsWith('plain body\n')).toBe(true);
  });

  test('readBinding returns null without binding keys', () => {
    expect(readBinding('---\ndepends_on: []\n---\nbody\n')).toBeNull();
  });
});

describe('deriveChangeId', () => {
  test('keeps existing verb prefix', () => {
    expect(deriveChangeId('port config and parsing')).toBe('port-config-and-parsing');
  });
  test('does not force a verb prefix (v1 pure slug)', () => {
    expect(deriveChangeId('demo feature')).toBe('demo-feature');
  });
  test('ascii-sanitizes and caps length', () => {
    const id = deriveChangeId('a very long ascii description '.repeat(6) + 'x');
    expect(id.length).toBeLessThanOrEqual(60);
    expect(/^[a-z0-9-]+$/u.test(id)).toBe(true);
  });
  test('pure non-ascii yields an error (v1)', () => {
    expect(() => deriveChangeId('中文描述')).toThrow('empty id after sanitizing');
  });
});

describe('attachChange default-branch gate (r31)', () => {
  test('refuses to attach on the default branch and writes no binding', () => {
    const { root } = makeGitRepo('demo-a', { prefix: 'llman-attach-' });
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    expect(() => attachChange(git, io, 'demo-a')).toThrow(/default branch/u);
    const proposal = readFileSync(
      join(root, 'llmanspec', 'changes', 'demo-a', 'proposal.md'),
      'utf8',
    );
    expect(proposal).not.toContain('branch:');
  });

  test('attaches on a feature branch', () => {
    const { root, run } = makeGitRepo('demo-a', { prefix: 'llman-attach-' });
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    run(['switch', '-qc', 'feat/x']);
    const result = attachChange(git, io, 'demo-a');
    expect(result.branch).toBe('feat/x');
    const proposal = readFileSync(
      join(root, 'llmanspec', 'changes', 'demo-a', 'proposal.md'),
      'utf8',
    );
    expect(proposal).toContain('branch: feat/x');
    expect(proposal).toContain('base_branch: main');
  });

  test('still refuses detached HEAD', () => {
    const { root, run } = makeGitRepo('demo-a', { prefix: 'llman-attach-' });
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    run(['switch', '-q', '--detach']);
    expect(() => attachChange(git, io, 'demo-a')).toThrow(/detached/u);
  });
});

describe('harvestUniqueNumbers (r35, v1 c-token parity)', () => {
  const io = (
    dirs: string[],
  ): { listDir: (p: string) => string[]; isDirectory: (p: string) => boolean } => ({
    listDir: (p) => (p === '.' ? dirs : []),
    isDirectory: () => true,
  });

  test('extracts c-tokens at boundaries, ignores leading digits', () => {
    expect(extractUniqueNumber('c10-active')).toBe(10);
    expect(extractUniqueNumber('2026-01-01-c20-slug')).toBe(20);
    expect(extractUniqueNumber('C30-UPPER')).toBe(30);
    expect(extractUniqueNumber('cab12')).toBeNull();
    expect(extractUniqueNumber('3-third')).toBeNull();
    expect(extractUniqueNumber('no-number')).toBeNull();
  });

  test('harvests whole tree at any depth, max+1, empty → null/1', () => {
    const tree = {
      listDir: (p: string): string[] => {
        if (p === '.') return ['changes'];
        if (p === './changes') return ['c10-active', 'archive', 'no-number'];
        if (p === './changes/archive') return ['2026-01-01-c20-slug'];
        return [];
      },
      isDirectory: () => true,
    };
    expect(harvestUniqueNumbers(tree, '.')).toEqual({
      maxNumber: 20,
      nextNumber: 21,
      warnings: [],
    });
    expect(harvestUniqueNumbers(io(['plain-only']), '.')).toEqual({
      maxNumber: null,
      nextNumber: 1,
      warnings: [],
    });
  });
});

describe('archiveChange gates (r39/r40)', () => {
  test('archiveTaskGate: pending blocks with item list; ratio gate fires', () => {
    const gate = archiveTaskGate('# Tasks\n- [ ] a\n- [x] b\n', undefined);
    expect(gate.blocked).toBe(true);
    expect(gate.reasons.some((r) => r.includes('- [ ] a'))).toBe(true);
    expect(archiveTaskGate('# Tasks\n- [x] a\n', undefined).blocked).toBe(false);
    const ratio = archiveTaskGate('# Tasks\n- [x] a\n- [ ] b\n', 1);
    expect(ratio.blocked).toBe(true);
    expect(ratio.reasons.some((r) => r.includes('min_completion_ratio'))).toBe(true);
  });
});

describe('r44/r45/r46 — change family flags', () => {
  test('attach refuses rebind without --force and allows with it; --base must exist', () => {
    const { root, run } = makeGitRepo('fam', { prefix: 'llman-family-' });
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    run(['switch', '-qc', 'feat/a']);
    attachChange(git, io, 'fam');
    expect(() => attachChange(git, io, 'fam')).toThrow(/already attached/u);
    attachChange(git, io, 'fam', { force: true });
    expect(() => attachChange(git, io, 'fam', { force: true, base: 'nope' })).toThrow(
      /does not exist/u,
    );
    attachChange(git, io, 'fam', { force: true, base: 'main' });
    const proposal = readFileSync(join(root, 'llmanspec', 'changes', 'fam', 'proposal.md'), 'utf8');
    expect(proposal).toContain('base_branch: main');
  });

  test('finalize noCommit renames without close-out commit', () => {
    const { root, run } = makeGitRepo('fam', { prefix: 'llman-family-' });
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    startChange(git, io, 'fam');
    writeFileSync(join(root, 'feat.txt'), 'x\n');
    run(['add', '-A']);
    run(['commit', '-qm', 'work']);
    const result = finalizeChange(git, io, 'fam', { noCommit: true });
    expect(result.commitSubject).toBe('');
    const status = run(['status', '--porcelain']);
    expect(status.stdout).not.toBe('');
    expect(existsSync(join(root, 'llmanspec', 'changes', 'archive'))).toBe(true);
  });

  test('changeDiffInfo reports commitCount', () => {
    const { root, run } = makeGitRepo('fam', { prefix: 'llman-family-' });
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    startChange(git, io, 'fam');
    writeFileSync(join(root, 'feat.txt'), 'x\n');
    run(['add', '-A']);
    run(['commit', '-qm', 'work']);
    const info = changeDiffInfo(git, io, 'fam');
    // v1 parity: `base` is the recorded base_sha (merge-base), not the branch name.
    expect(info).toMatchObject({ change: 'fam', branch: 'sdd/fam', commitCount: 1 });
    expect(info.base).toMatch(/^[0-9a-f]{40}$/u);
  });
});

describe('finalize branch gate (r15 / v1 r94)', () => {
  test('finalize from a foreign branch fails before any write', () => {
    const { root, run } = makeGitRepo('fam', { prefix: 'llman-finalize-gate-' });
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    startChange(git, io, 'fam');
    run(['switch', 'main']);
    const before = run(['rev-parse', 'HEAD']).stdout;
    expect(() => finalizeChange(git, io, 'fam')).toThrow(/bound branch/u);
    const after = run(['rev-parse', 'HEAD']).stdout;
    expect(after).toBe(before);
    expect(existsSync(join(root, 'llmanspec', 'changes', 'fam'))).toBe(true);
  });
});
