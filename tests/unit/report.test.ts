import { describe, expect, test } from 'bun:test';

import {
  collectChanges,
  graphData,
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

  test('statusFor task matrix (no-tasks / complete / in-progress)', () => {
    expect(statusFor(0, 0)).toBe('no-tasks');
    expect(statusFor(2, 2)).toBe('complete');
    expect(statusFor(2, 1)).toBe('in-progress');
  });

  test('json rendering carries name/stage/status/task counts', () => {
    const changes = collectChanges(fakeChangeIo(), '.', NOW);
    const json = JSON.parse(renderChangesJson(changes));
    expect(json.changes[0]).toMatchObject({
      name: 'add-alpha',
      stage: 'full',
      status: 'in-progress',
      completedTasks: 1,
      totalTasks: 2,
    });
  });

  test('list rendering annotates idle only for no-tasks rows', () => {
    const changes = collectChanges(fakeChangeIo(), '.', NOW);
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

  test('frozen flat cards are archived nodes and keep dependency edges (r54)', () => {
    const io: GraphFsIo = {
      exists: () => true,
      // Frozen card carries frontmatter (incl. depends_on) at the archive path
      // `<date>-<id>.yaml`; active proposals read from the change dir.
      readText: (p) =>
        p.endsWith('add-alpha/proposal.md')
          ? '---\ndepends_on:\n  - add-beta\n  - add-old\n  - add-flat\n---\n\nx\n'
          : '---\ndepends_on: []\n---\n\nx\n',
      listDir: (p) =>
        p.endsWith('archive')
          ? ['2026-09-01-add-old', '2026-09-02-add-flat.yaml']
          : ['add-alpha', 'add-beta', 'archive'],
      isDirectory: (p) => !p.endsWith('.yaml'),
    };
    const lines = graphMermaid(io, '.');
    expect(lines[0]).toBe('flowchart TD');
    // Frozen card node is rendered like an archived change.
    expect(lines).toContain('    add_flat["add-flat ✓ done"]:::archived');
    // Dependency edge to the frozen card survives.
    expect(lines).toContain('    add_alpha -->|depends on| add_flat');
    expect(lines.at(-1)).toContain('classDef archived');
  });

  test('proposalFor prefers a real dir proposal over a same-id frozen card', () => {
    const io: GraphFsIo = {
      exists: (p) => p.endsWith('2026-09-01-add-old/proposal.md') || p.includes('archive'),
      readText: (p) =>
        p.endsWith('2026-09-01-add-old/proposal.md') ? '---\ndepends_on: [x]\n---\n' : '',
      listDir: (p) =>
        p.endsWith('archive')
          ? ['2026-09-01-add-old', '2026-09-01-add-old.yaml']
          : ['add-alpha', 'add-beta', 'archive'],
      isDirectory: (p) => !p.endsWith('.yaml'),
    };
    // scope archived renders the dir-based node with its own frontmatter; both
    // the dir and the card resolve the same id, dir wins (latest matching).
    const lines = graphMermaid(io, '.', { scope: 'archived' });
    expect(lines.some((l) => l.includes('add_old["add-old ✓ done"]:::archived'))).toBe(true);
  });
});

describe('nextReqId', () => {
  // max+1 semantics (align-next-req-id-max-plus-one): smallest free would alias
  // archived references once a rule block is deleted (issue #5).
  const ioWithRules = (files: Record<string, string>): SpecHelperIo => {
    const names = Object.keys(files);
    return {
      exists: () => true,
      readText: (path: string) => files[path] ?? '',
      writeText: () => {},
      mkdirp: () => {},
      isDirectory: () => false,
      listDir: () => names.map((p) => p.replace(/^llmanspec\/specs\//u, '')),
    };
  };
  const featureWithRule = (capability: string, reqId: string) =>
    `# language: zh-CN\n# capability: ${capability}\n# purpose: p\n# scope: x/\n\n功能: ${capability}\n\n  @req:${reqId}\n  规则: ok\n    系统 MUST x\n\n    场景: acc\n      假如 前置\n`;

  test('reads @req handles on rule headers only — @req in step text must not count', () => {
    const io = ioWithRules({
      'llmanspec/specs/t.feature':
        '# language: zh-CN\n# capability: t\n# purpose: p\n# scope: x/\n\n功能: t\n\n  @req:r5\n  规则: ok\n    系统 MUST x\n\n    场景: acc\n      假如 一个 spec 文件都含 @req:r99 标签\n',
    });
    // r99 sits in step text, not a rule header: max in use is r5 -> r6.
    expect(nextReqId(io, 'llmanspec/specs')).toBe('r6');
  });

  test('empty registry starts at r1', () => {
    const io = ioWithRules({});
    expect(nextReqId(io, 'llmanspec/specs')).toBe('r1');
  });

  test('gap regression lock: freed ranges are never reused (issue #5) — r1+r5 -> r6', () => {
    const io = ioWithRules({
      'llmanspec/specs/a.feature': featureWithRule('a', 'r1'),
      'llmanspec/specs/b.feature': featureWithRule('b', 'r5'),
    });
    // smallest free would hand out r2 (freed by the deleted r2-r4 capability);
    // max+1 skips the retired gap entirely.
    expect(nextReqId(io, 'llmanspec/specs')).toBe('r6');
  });
});

describe('stageFor monotonic rule (r34)', () => {
  test('planned requires design AND tasks; tasks-only stays draft', () => {
    expect(stageFor(false, false, false)).toBe('draft');
    expect(stageFor(true, false, false)).toBe('designed');
    expect(stageFor(true, true, false)).toBe('planned');
    expect(stageFor(true, true, true)).toBe('full');
    // 对齐前代:无 design 时 tasks 单独存在不升级(前代对拍:tasks-only → draft)
    expect(stageFor(false, true, false)).toBe('draft');
    // 绑定不越过文件单调门槛(前代: design/tasks 缺失时 attached 仍按文件定档)
    expect(stageFor(false, true, true)).toBe('draft');
    expect(stageFor(true, false, true)).toBe('designed');
  });
});

describe('collectChanges ordering (r51 recent base)', () => {
  test('orders newest-first (mtime desc), independent of name alphabet', () => {
    // r51 的 `--sort name` 字典序在 CLI 侧(apps/cli),由 BDD @executable 覆盖;
    // core 层锚定缺省 recent 排序的载荷顺序:collectChanges 按 mtime 降序返回。
    const mkIo = (mtimes: Record<string, number>): ChangeFsIo => ({
      exists: (p) => p.endsWith('changes') || p.endsWith('proposal.md'),
      readText: (p) =>
        p.includes('a-change')
          ? '---\ndepends_on: []\n---\n\n# A\n'
          : p.includes('b-change')
            ? '---\ndepends_on: []\n---\n\n# B\n'
            : '---\ndepends_on: []\n---\n\n# C\n',
      listDir: (p) => (p.endsWith('changes') ? ['a-change', 'b-change', 'c-change'] : []),
      isDirectory: (p) => !p.endsWith('.md'),
      mtimeMs: (p) => mtimes[p] ?? 0,
    });
    const mtimes = {
      './llmanspec/changes/a-change/proposal.md': 1_000,
      './llmanspec/changes/b-change/proposal.md': 3_000,
      './llmanspec/changes/c-change/proposal.md': 2_000,
    };
    const names = collectChanges(mkIo(mtimes), '.', NOW).map((c) => c.name);
    expect(names).toEqual(['b-change', 'c-change', 'a-change']);
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

  // 跨 active→archived 边界的依赖链:a-front(唯一活跃) → b-mid → c-tail。
  // 用于全图 depth 语义的 0/1/2 三档断言(scope active 只有根节点)。
  const mkChainIo = (): GraphFsIo => ({
    exists: () => true,
    readText: (p) => {
      if (p.includes('a-front')) return '---\ndepends_on: [b-mid]\n---\n\nx\n';
      if (p.includes('b-mid')) return '---\ndepends_on: [c-tail]\n---\n\nx\n';
      return '---\ndepends_on: []\n---\n\nx\n';
    },
    listDir: (dir) => {
      if (dir.endsWith('archive')) return ['2026-09-01-b-mid', '2026-09-02-c-tail'];
      if (dir.endsWith('changes')) return ['a-front', 'archive'];
      return [];
    },
    isDirectory: () => true,
  });

  test('full-graph default equals depth 1 and pulls direct deps only (r54)', () => {
    const def = graphMermaid(mkChainIo(), '.');
    const d1 = graphMermaid(mkChainIo(), '.', { depth: 1 });
    expect(def).toEqual(d1);
    expect(def.some((l) => l.includes('a_front'))).toBe(true);
    expect(def.some((l) => l.includes('b_mid'))).toBe(true);
    expect(def.some((l) => l.includes('c_tail'))).toBe(false);
  });

  test('full-graph depth 0 keeps scope nodes only (r54)', () => {
    const lines = graphMermaid(mkChainIo(), '.', { depth: 0 });
    expect(lines.some((l) => l.includes('a_front'))).toBe(true);
    expect(lines.some((l) => l.includes('b_mid'))).toBe(false);
    expect(lines.some((l) => l.includes('c_tail'))).toBe(false);
  });

  test('full-graph depth 2 expands recursively along depends_on (r54)', () => {
    const lines = graphMermaid(mkChainIo(), '.', { depth: 2 });
    for (const id of ['a_front', 'b_mid', 'c_tail']) {
      expect(lines.some((l) => l.includes(id))).toBe(true);
    }
    // 链耗尽后深度不再引入新节点
    const wide = graphMermaid(mkChainIo(), '.', { depth: 3 });
    expect(wide).toEqual(lines);
  });

  test('graphData honors depth in no-seed mode (r54)', () => {
    const d0 = graphData(mkChainIo(), '.', { scope: 'active', depth: 0 });
    expect(d0.nodes.map((n) => n.id)).toEqual(['a-front']);
    const d1 = graphData(mkChainIo(), '.', { scope: 'active', depth: 1 });
    expect(d1.nodes.map((n) => n.id).toSorted()).toEqual(['a-front', 'b-mid']);
    const d2 = graphData(mkChainIo(), '.', { scope: 'active', depth: 2 });
    expect(d2.nodes.map((n) => n.id).toSorted()).toEqual(['a-front', 'b-mid', 'c-tail']);
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
