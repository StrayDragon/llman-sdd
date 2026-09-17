import { describe, expect, test } from 'bun:test';

import {
  collectChanges,
  graphMermaid,
  nextReqId,
  renderChangesJson,
  renderChangesList,
  stageFor,
  statusFor,
  type ChangeFsIo,
  type GraphFsIo,
  type SpecHelperIo,
} from '@llman-sdd/core';

const NOW = new Date('2026-09-14T12:00:00Z');

function fakeChangeIo(): ChangeFsIo {
  const files = new Map<string, string>([
    [
      './llmanspec/changes/add-alpha/proposal.md',
      '---\nbranch: sdd/add-alpha\nbase_branch: main\nbase_sha: abc123\ndepends_on:\n  - add-beta\n---\n\n# Alpha 标题\n\nbody\n',
    ],
    ['./llmanspec/changes/add-alpha/tasks.md', '# Tasks\n\n- [x] A\n- [ ] B\n'],
    ['./llmanspec/changes/add-alpha/design.md', '# Design\n'],
    ['./llmanspec/changes/add-beta/proposal.md', '---\ndepends_on: []\n---\n\n## Why\n\nx\n'],
    ['./llmanspec/changes/archive/2026-09-01-add-old/proposal.md', '## Why\n\nx\n'],
  ]);
  const mtimes = new Map<string, number>([
    ['./llmanspec/changes/add-alpha/proposal.md', NOW.getTime() - 3_600_000],
    ['./llmanspec/changes/add-alpha/tasks.md', NOW.getTime() - 1_800_000],
    ['./llmanspec/changes/add-alpha/design.md', NOW.getTime() - 7_200_000],
    ['./llmanspec/changes/add-beta/proposal.md', NOW.getTime() - 5 * 86_400_000],
  ]);
  return {
    exists: (p) =>
      files.has(p) ||
      p.endsWith('changes') ||
      p.endsWith('archive') ||
      p.endsWith('add-alpha') ||
      p.endsWith('add-beta') ||
      p.endsWith('add-old'),
    readText: (p) => files.get(p) ?? '',
    listDir: (p) =>
      p.endsWith('changes')
        ? ['add-alpha', 'add-beta', 'archive']
        : p.endsWith('archive')
          ? ['2026-09-01-add-old']
          : [],
    isDirectory: (p) => !p.endsWith('.md'),
    mtimeMs: (p) => mtimes.get(p) ?? 0,
  };
}

describe('collectChanges', () => {
  test('skips archive, derives stage/status/idle', () => {
    const changes = collectChanges(fakeChangeIo(), '.', NOW);
    expect(changes.map((c) => c.name)).toEqual(['add-alpha', 'add-beta']);
    expect(changes[0]?.stage).toBe('full');
    expect(changes[0]?.completedTasks).toBe(1);
    expect(changes[0]?.totalTasks).toBe(2);
    expect(changes[0]?.idleDays).toBe(0);
    expect(changes[1]?.stage).toBe('draft');
    expect(changes[1]?.idleDays).toBe(5);
  });

  test('status enum and list/json rendering', () => {
    expect(statusFor(0, 0)).toBe('no-tasks');
    expect(statusFor(2, 2)).toBe('complete');
    expect(statusFor(2, 1)).toBe('in-progress');
    expect(stageFor(false, false, false)).toBe('draft');
    expect(stageFor(true, false, false)).toBe('designed');
    expect(stageFor(true, true, false)).toBe('planned');
    expect(stageFor(true, true, true)).toBe('full');

    const changes = collectChanges(fakeChangeIo(), '.', NOW);
    const json = JSON.parse(renderChangesJson(changes));
    expect(json.changes[0]).toMatchObject({
      name: 'add-alpha',
      stage: 'full',
      status: 'in-progress',
      completedTasks: 1,
      totalTasks: 2,
    });
    const lines = renderChangesList(changes, NOW);
    expect(lines[0]).toBe('Active changes:');
    // no-tasks 行才带 idle 段
    expect(lines[1]).not.toContain('(idle');
    expect(lines[2]).toContain('(idle 5d)');
  });
});

describe('graphMermaid', () => {
  test('sanitizes ids, annotates referenced archived only, keeps edges', () => {
    const io: GraphFsIo = {
      exists: () => true,
      readText: (p) =>
        p.includes('add-alpha')
          ? '---\ndepends_on:\n  - add-beta\n  - add-old\n---\n\nx\n'
          : '---\ndepends_on: []\n---\n\nx\n',
      listDir: (p) =>
        p.endsWith('archive')
          ? ['2026-09-01-add-old', '2026-09-01-add-unreferenced']
          : ['add-alpha', 'add-beta', 'archive'],
      isDirectory: () => true,
    };
    const lines = graphMermaid(io, '.');
    expect(lines[0]).toBe('flowchart TD');
    expect(lines).toContain('    add_alpha["add-alpha"]');
    expect(lines).toContain('    add_old["add-old ✓ done"]:::archived');
    expect(lines.some((l) => l.includes('add_unreferenced'))).toBe(false);
    expect(lines).toContain('    add_alpha -->|depends on| add_beta');
    expect(lines).toContain('    add_alpha -->|depends on| add_old');
    expect(lines.at(-1)).toContain('classDef archived');
  });

  test('parses flow-style depends_on identically to block style (r30)', () => {
    const mkIo = (depsLine: string): GraphFsIo => ({
      exists: () => true,
      readText: (p) =>
        p.includes('add-alpha')
          ? `---\n${depsLine}\n---\n\nx\n`
          : '---\ndepends_on: []\n---\n\nx\n',
      listDir: (p) =>
        p.endsWith('archive') ? ['2026-09-01-add-old'] : ['add-alpha', 'add-beta', 'archive'],
      isDirectory: () => true,
    });
    const flow = graphMermaid(mkIo('depends_on: [add-beta, add-old]'), '.');
    expect(flow).toContain('    add_old["add-old ✓ done"]:::archived');
    expect(flow).toContain('    add_alpha -->|depends on| add_beta');
    expect(flow).toContain('    add_alpha -->|depends on| add_old');
    const block = graphMermaid(mkIo('depends_on:\n  - add-beta\n  - add-old'), '.');
    expect(flow).toEqual(block);
  });

  test('treats empty flow and malformed frontmatter as no deps (r30)', () => {
    const mkIo = (proposal: string): GraphFsIo => ({
      exists: () => true,
      readText: () => proposal,
      listDir: (p) => (p.endsWith('archive') ? [] : ['add-alpha', 'archive']),
      isDirectory: () => true,
    });
    const emptyFlow = graphMermaid(mkIo('---\ndepends_on: []\n---\n\nx\n'), '.');
    expect(emptyFlow.some((l) => l.includes('-->'))).toBe(false);
    const malformed = graphMermaid(mkIo('---\ndepends_on: [add-\n---\n\nx\n'), '.');
    expect(malformed[0]).toBe('flowchart TD');
    expect(malformed.some((l) => l.includes('-->'))).toBe(false);
  });
});

describe('nextReqId', () => {
  test('reads TAGS only — @req in step text must not count (v1 parity)', () => {
    const io: SpecHelperIo = {
      exists: () => true,
      readText: () =>
        '# language: zh-CN\n# capability: t\n# purpose: p\n# scope: x/\n\n功能: t\n\n  @req:r5 @human\n  场景: ok\n    - 系统 MUST x\n\n  @req:r5 @executable\n  场景: acc\n    假如 一个 spec 文件都含 @req:r99 标签\n',
      writeText: () => {},
      mkdirp: () => {},
      isDirectory: () => false,
      listDir: () => ['t.feature'],
    };
    // v1 parity: smallest free rN over @human rule ids (r5 only -> r1).
    expect(nextReqId(io, 'llmanspec/specs')).toBe('r1');
  });
});

describe('stageFor monotonic rule (r34)', () => {
  test('planned requires design AND tasks; tasks-only stays draft', () => {
    expect(stageFor(false, false, false)).toBe('draft');
    expect(stageFor(true, false, false)).toBe('designed');
    expect(stageFor(true, true, false)).toBe('planned');
    expect(stageFor(true, true, true)).toBe('full');
    // 对齐 v1:无 design 时 tasks 单独存在不升级(v1 对拍:tasks-only → draft)
    expect(stageFor(false, true, false)).toBe('draft');
    // 绑定不越过文件单调门槛(v1: design/tasks 缺失时 attached 仍按文件定档)
    expect(stageFor(false, true, true)).toBe('draft');
    expect(stageFor(true, false, true)).toBe('designed');
  });
});

describe('list sort (r51)', () => {
  test('name sort is alphabetical, recent stays mtime desc', () => {
    const base = {
      path: '',
      title: '',
      stage: 'draft' as const,
      hasBinding: false,
      completedTasks: 0,
      totalTasks: 0,
      idleDays: 0,
      status: 'no-tasks' as const,
    };
    const changes = [
      { ...base, name: 'b-change', lastModified: new Date('2026-01-03') },
      { ...base, name: 'a-change', lastModified: new Date('2026-01-02') },
      { ...base, name: 'c-change', lastModified: new Date('2026-01-01') },
    ];
    const byName = [...changes].toSorted((a, b) => a.name.localeCompare(b.name)).map((c) => c.name);
    expect(byName).toEqual(['a-change', 'b-change', 'c-change']);
    const byRecent = [...changes]
      .toSorted((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
      .map((c) => c.name);
    expect(byRecent).toEqual(['b-change', 'a-change', 'c-change']);
  });
});

describe('graph scope/depth/seed (r54)', () => {
  const mkIo = (): GraphFsIo => ({
    exists: () => true,
    readText: (p) => {
      if (p.includes('seeded')) return '---\ndepends_on: [mid]\n---\n\nx\n';
      if (p.includes('mid')) return '---\ndepends_on:\n  - old-a\n  - old-b\n---\n\nx\n';
      return '---\ndepends_on: []\n---\n\nx\n';
    },
    listDir: (dir) => {
      if (dir.endsWith('archive')) return ['2026-09-01-old-a', '2026-09-01-old-b'];
      if (dir.endsWith('changes')) return ['seeded', 'mid', 'archive'];
      return [];
    },
    isDirectory: () => true,
  });

  test('scope archived shows only archived nodes', () => {
    const lines = graphMermaid(mkIo(), '.', { scope: 'archived' });
    expect(lines.some((l) => l.includes('old_a'))).toBe(true);
    expect(lines.some((l) => l.includes('mid'))).toBe(false);
    expect(lines.some((l) => l.includes('seeded'))).toBe(false);
  });

  test('scope all shows everything', () => {
    const lines = graphMermaid(mkIo(), '.', { scope: 'all' });
    for (const id of ['seeded', 'mid', 'old_a', 'old_b']) {
      expect(lines.some((l) => l.includes(id))).toBe(true);
    }
  });

  test('seed with depth 1 keeps seed and direct deps only', () => {
    const lines = graphMermaid(mkIo(), '.', { seed: 'seeded', depth: 1 });
    expect(lines.some((l) => l.includes('seeded'))).toBe(true);
    expect(lines.some((l) => l.includes('mid'))).toBe(true);
    expect(lines.some((l) => l.includes('old_a'))).toBe(false);
    const deep = graphMermaid(mkIo(), '.', { seed: 'seeded', depth: 2 });
    expect(deep.some((l) => l.includes('old_a'))).toBe(true);
  });
});

describe('collectChanges maxScanDepth (r58)', () => {
  const PROPOSALS = new Set([
    './llmanspec/changes/top-change/proposal.md',
    './llmanspec/changes/nested/deep/proposal.md',
  ]);
  const tree = {
    exists: (p: string) => p === './llmanspec/changes' || PROPOSALS.has(p),
    listDir: (p: string) => {
      if (p === './llmanspec/changes') return ['top-change', 'nested'];
      if (p === './llmanspec/changes/nested') return ['deep'];
      return ['proposal.md'];
    },
    isDirectory: (p: string) => !p.endsWith('proposal.md'),
    readText: () => '---\ndepends_on: []\n---\n\n## Why\nx\n',
    mtimeMs: () => 0,
  } as never;

  test('depth 1 misses nested, depth 2 finds it', () => {
    const now = new Date();
    const shallow = collectChanges(tree, '.', now, { maxScanDepth: 1 }).map((c) => c.name);
    expect(shallow).toEqual(['top-change']);
    const deep = collectChanges(tree, '.', now, { maxScanDepth: 2 }).map((c) => c.name);
    expect(deep.toSorted()).toEqual(['deep', 'top-change']);
  });
});
