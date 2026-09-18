import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  archiveChange,
  archiveTaskGate,
  attachChange,
  deriveChangeId,
  extractUniqueNumber,
  harvestUniqueNumbers,
  makeSpawnGit,
  readBinding,
  writeBinding,
} from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';

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
  test('adds verb when missing', () => {
    expect(deriveChangeId('demo feature')).toBe('add-demo-feature');
  });
  test('ascii-sanitizes and caps length', () => {
    const id = deriveChangeId('修复 某个非常长的中文描述'.repeat(5));
    expect(id.length).toBeLessThanOrEqual(60);
    expect(/^[a-z0-9-]+$/u.test(id)).toBe(true);
  });
  test('pure non-ascii falls back to add-change', () => {
    expect(deriveChangeId('中文描述')).toBe('add-change');
  });
});

describe('attachChange default-branch gate (r31)', () => {
  const makeRepo = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'llman-attach-'));
    const run = (args: string[]): void => {
      spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        cwd: root,
        encoding: 'utf8',
      });
    };
    run(['init', '-q', '-b', 'main']);
    mkdirSync(join(root, 'llmanspec', 'changes', 'demo-a'), { recursive: true });
    writeFileSync(
      join(root, 'llmanspec', 'changes', 'demo-a', 'proposal.md'),
      '---\ndepends_on: []\n---\n\n## Why\nx\n',
    );
    run(['add', '-A']);
    run(['commit', '-qm', 'init']);
    return root;
  };

  test('refuses to attach on the default branch and writes no binding', () => {
    const root = makeRepo();
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
    const root = makeRepo();
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    spawnSync('git', ['switch', '-qc', 'feat/x'], { cwd: root });
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
    const root = makeRepo();
    const git = makeSpawnGit(root);
    const io = makeNodeIo(root);
    spawnSync('git', ['switch', '-q', '--detach'], { cwd: root });
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
  const makeBoundRepo = (tasks: string): { root: string } => {
    const root = mkdtempSync(join(tmpdir(), 'llman-archive-'));
    const run = (args: string[]): void => {
      spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        cwd: root,
        encoding: 'utf8',
      });
    };
    run(['init', '-q', '-b', 'main']);
    const dir = join(root, 'llmanspec', 'changes', 'demo-arch');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
    if (tasks !== '') writeFileSync(join(dir, 'tasks.md'), tasks);
    run(['add', '-A']);
    run(['commit', '-qm', 'init']);
    return { root };
  };

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
