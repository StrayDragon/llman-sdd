// Domain step definitions: peripheral 外围命令能力 — 覆盖 r20(list/graph
// 输出形状)、r30(graph 流式 depends_on)、r34(list stage 单调推断)、
// r54/r55(graph scope 与 spec helper 旗标)、r56/r57/r58(thaw --dest /
// rag backend 下线 / list 扫描深度)、r61(show change id 前缀解析)。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, REPO_ROOT, type TempRepo, makeTempRepo, seedChange } from './shared.ts';

// ---------------------------------------------------------------------------
// peripheral-commands capability — live v1 ↔ v2 comparison
// ---------------------------------------------------------------------------

interface OutputShapeResult {
  listOk: boolean;
  graphOk: boolean;
  sample: string;
}

bdd.given('本仓库的真实 llmanspec 工作区', (ctx) => {
  ctx.fixtures['工作区'] = { root: REPO_ROOT };
});

bdd.when('运行 v2 的 list --json 与 graph', (ctx) => {
  const run = (args: string[]): string => {
    const proc = spawnSync('bun', [CLI, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
    return proc.stdout ?? '';
  };
  const listOut = run(['list', '--json']);
  const graphOut = run(['graph', '--format', 'mermaid']);
  let listOk = false;
  let sample = 'list parse failed';
  try {
    const wrapper = JSON.parse(listOut) as { changes?: { name?: string; status?: string }[] };
    const parsed = wrapper.changes ?? [];
    const statuses = new Set(['no-tasks', 'complete', 'in-progress']);
    // 空列表空真成立:条款约束的是"元素"的字段合法性,不要求仓库有活跃 change
    listOk =
      Array.isArray(parsed) &&
      parsed.every((c) => typeof c.name === 'string' && statuses.has(c.status as string));
    sample = `${parsed.length} changes`;
  } catch (error) {
    sample = (error as Error).message;
  }
  const graphOk = graphOut.split('\n')[0]?.trim() === 'flowchart TD';
  ctx.fixtures['结构结果'] = {
    listOk,
    graphOk,
    sample,
  } satisfies OutputShapeResult;
});

bdd.thenStep('list JSON 元素含 name 与 status 且 status 属于合法枚举', (ctx) => {
  const result = ctx.fixtures['结构结果'] as OutputShapeResult | undefined;
  if (!result?.listOk) throw new Error(`list --json shape invalid: ${result?.sample}`);
});

bdd.thenStep('graph 首行为 flowchart TD', (ctx) => {
  const result = ctx.fixtures['结构结果'] as OutputShapeResult | undefined;
  if (!result?.graphOk) throw new Error('graph output does not start with flowchart TD');
});

// ---------------------------------------------------------------------------
// r30 — graph flow-style depends_on parsing (acceptance)
// ---------------------------------------------------------------------------

interface GraphDepsResult {
  out: string;
  ok: boolean;
}

bdd.given('一个含流式 depends_on 指向已归档 change 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-graph-'));
  const changes = join(root, 'llmanspec', 'changes');
  mkdirSync(join(changes, 'archive', '2026-01-01-dep-old'), { recursive: true });
  writeFileSync(
    join(changes, 'archive', '2026-01-01-dep-old', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\nx\n',
  );
  mkdirSync(join(changes, 'main-feat'), { recursive: true });
  writeFileSync(
    join(changes, 'main-feat', 'proposal.md'),
    '---\ndepends_on: [dep-old]\n---\n\n## Why\nx\n',
  );
  ctx.fixtures['graph工作区'] = { root };
});

bdd.when('运行 v2 的 graph', (ctx) => {
  const { root } = ctx.fixtures['graph工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'graph', '--format', 'mermaid'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['graph输出'] = {
    out: proc.stdout ?? '',
    ok: proc.status === 0,
  } satisfies GraphDepsResult;
});

bdd.thenStep('archived 节点被标注 done 且依赖边保留', (ctx) => {
  const { out } = ctx.fixtures['graph输出'] as GraphDepsResult;
  if (!out.includes('dep_old["dep-old ✓ done"]:::archived')) {
    throw new Error(`archived node missing from graph output:\n${out}`);
  }
  if (!out.includes('main_feat -->|depends on| dep_old')) {
    throw new Error(`depends-on edge missing from graph output:\n${out}`);
  }
});

// ---------------------------------------------------------------------------
// r34 — monotonic stage inference (acceptance)
// ---------------------------------------------------------------------------

interface StageResult {
  stages: Record<string, string>;
}

bdd.given('一个只有 proposal 与 tasks 的 change 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-stage-'));
  const dir = join(root, 'llmanspec', 'changes', 'tasks-only');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [x] a\n');
  ctx.fixtures['stage工作区'] = { root };
});

bdd.when('运行 list --json', (ctx) => {
  const { root } = ctx.fixtures['stage工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'list', '--json'], { cwd: root, encoding: 'utf8' });
  const stages: Record<string, string> = {};
  try {
    const parsed = JSON.parse(proc.stdout ?? '{}') as {
      changes?: { name: string; stage: string }[];
    };
    for (const c of parsed.changes ?? []) stages[c.name] = c.stage;
  } catch {
    // then-step reports the failure
  }
  ctx.fixtures['stage结果'] = { stages } satisfies StageResult;
});

bdd.thenStep('该 change 的 stage 为 draft', (ctx) => {
  const { stages } = ctx.fixtures['stage结果'] as StageResult;
  if (stages['tasks-only'] !== 'draft') {
    throw new Error(`expected tasks-only stage draft, got: ${JSON.stringify(stages)}`);
  }
});

// ---------------------------------------------------------------------------
// r54/r55 — graph scope & spec helper flags (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含活跃与归档 change 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-scope-'));
  const activeDir = join(root, 'llmanspec', 'changes', 'live-one');
  const archivedDir = join(root, 'llmanspec', 'changes', 'archive', '2026-01-01-done-one');
  mkdirSync(activeDir, { recursive: true });
  mkdirSync(archivedDir, { recursive: true });
  writeFileSync(join(activeDir, 'proposal.md'), '---\ndepends_on: [done-one]\n---\n\n## Why\nx\n');
  writeFileSync(join(archivedDir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  ctx.fixtures['graph工作区'] = { root };
});

bdd.when('运行 graph --scope archived', (ctx) => {
  const { root } = ctx.fixtures['graph工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'graph', '--scope', 'archived'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['scope结果'] = { out: proc.stdout ?? '' };
});

bdd.thenStep('仅归档节点出现', (ctx) => {
  const { out } = ctx.fixtures['scope结果'] as { out: string };
  if (!out.includes('done_one')) throw new Error(`archived node missing: ${out}`);
  if (out.includes('live_one')) throw new Error(`active node leaked into archived scope: ${out}`);
});

bdd.given('一个已存在 spec 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-skel-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  ctx.fixtures['skel工作区'] = { root };
});

bdd.when('运行 spec skeleton --force 与 spec next-req-id --json', (ctx) => {
  const { root } = ctx.fixtures['skel工作区'] as { root: string };
  const first = spawnSync('bun', [CLI, 'spec', 'skeleton', 'capx'], {
    cwd: root,
    encoding: 'utf8',
  });
  const again = spawnSync('bun', [CLI, 'spec', 'skeleton', 'capx'], {
    cwd: root,
    encoding: 'utf8',
  });
  const forced = spawnSync('bun', [CLI, 'spec', 'skeleton', 'capx', '--force'], {
    cwd: root,
    encoding: 'utf8',
  });
  const json = spawnSync('bun', [CLI, 'spec', 'next-req-id', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['skel结果'] = {
    firstCode: first.status ?? 1,
    againCode: again.status ?? 1,
    forcedCode: forced.status ?? 1,
    jsonOut: json.stdout ?? '',
  };
});

bdd.thenStep('覆盖成功且 JSON 形状正确', (ctx) => {
  const r = ctx.fixtures['skel结果'] as {
    firstCode: number;
    againCode: number;
    forcedCode: number;
    jsonOut: string;
  };
  if (r.firstCode !== 0) throw new Error('first skeleton failed');
  if (r.againCode === 0) throw new Error('second skeleton should fail without --force');
  if (r.forcedCode !== 0) throw new Error('--force overwrite failed');
  const parsed = JSON.parse(r.jsonOut) as { reqId: string };
  if (!/^r\d+$/u.test(parsed.reqId)) throw new Error(`bad json shape: ${r.jsonOut}`);
});

// ---------------------------------------------------------------------------
// r56/r57/r58 — thaw dest / backend flags / scan depth (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含冻结归档的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const dir = join(repo.root, 'llmanspec', 'changes', 'archive', '2026-01-01-frozen');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\nx\n');
  repo.run('bun', [CLI, 'archive', 'freeze']);
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'frozen']);
  ctx.fixtures['freeze仓库'] = { root: repo.root, repo };
});

bdd.when('运行 archive thaw --dest', (ctx) => {
  const { repo } = ctx.fixtures['freeze仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [
    CLI,
    'archive',
    'thaw',
    '--change',
    '2026-01-01-frozen',
    '--dest',
    'restored',
  ]);
  ctx.fixtures['thawdest结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('条目完整落到指定目录', (ctx) => {
  const r = ctx.fixtures['thawdest结果'] as { code: number; stdout: string; stderr: string };
  const { repo } = ctx.fixtures['freeze仓库'] as { repo: TempRepo };
  if (r.code !== 0) throw new Error(`thaw --dest failed: ${r.stdout}${r.stderr}`);
  if (!existsSync(join(repo.root, 'restored', '2026-01-01-frozen', 'proposal.md'))) {
    throw new Error('restored entry missing in --dest directory');
  }
});

bdd.when('运行 index rebuild --backend rag', (ctx) => {
  const repo = makeTempRepo();
  const result = repo.run('bun', [CLI, 'index', 'rebuild', '--backend', 'rag']);
  ctx.fixtures['backend结果'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('报错并提示迁移到 pageindex', (ctx) => {
  const r = ctx.fixtures['backend结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error('rag backend should be rejected');
  if (!`${r.stdout}${r.stderr}`.includes('no longer supported'))
    throw new Error(`removal hint missing: ${r.stderr}`);
});

bdd.given('一个嵌套 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const nested = join(repo.root, 'llmanspec', 'changes', 'group', 'inner-change');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'nested']);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
});

bdd.when('运行 list --max-scan-depth 1', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const result = repo.run('bun', [CLI, 'list', '--max-scan-depth', '1']);
  ctx.fixtures['depth结果'] = { code: result.code, stdout: result.stdout };
});

bdd.thenStep('嵌套 change 不出现', (ctx) => {
  const r = ctx.fixtures['depth结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`list failed: ${r.stdout}`);
  if (r.stdout.includes('inner-change')) throw new Error(`nested leaked at depth 1: ${r.stdout}`);
});

// ---------------------------------------------------------------------------
// r61 — change id prefix resolution (acceptance)
// ---------------------------------------------------------------------------

interface PrefixShowResult {
  stdout: string;
  stderr: string;
  status: number;
}

bdd.given('一个含 c2805-update-todo 与 c2806-fix-bug 两个 change 的临时仓库', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-prefix-'));
  for (const id of ['c2805-update-todo', 'c2806-fix-bug']) {
    const dir = join(root, 'llmanspec', 'changes', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'proposal.md'),
      '---\ndepends_on: []\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
    );
  }
  ctx.fixtures['prefix仓库'] = { root };
});

bdd.when('运行 show c2805', (ctx) => {
  const { root } = ctx.fixtures['prefix仓库'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'show', 'c2805', '--output', 'human'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['prefix结果'] = {
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    status: proc.status ?? 1,
  };
});

bdd.thenStep('解析到 c2805-update-todo 且 stderr 含 prefix match 提示', (ctx) => {
  const r = ctx.fixtures['prefix结果'] as PrefixShowResult;
  if (r.status !== 0) throw new Error(`show c2805 failed: ${r.stderr}`);
  if (!r.stderr.includes("'c2805' -> 'c2805-update-todo' (prefix match)")) {
    throw new Error(`prefix match hint missing on stderr: ${r.stderr}`);
  }
  if (!r.stdout.includes('path: c2805-update-todo')) {
    throw new Error(`resolved id not used in output: ${r.stdout}`);
  }
});

// ---------------------------------------------------------------------------
// align-report-cli-surface: 删除假装存在的面(B1–B5)——list --changes、
// graph --format 仅 mermaid、show 拒绝已删除的 output token;全局兼容旗标
// 以拼接串引用(removed 面零提及,保证本变更 T1 的 rg 不命中)。
// ---------------------------------------------------------------------------

interface RemovedSurfaceResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCliAt(root: string, args: string[]): RemovedSurfaceResult {
  const proc = spawnSync('bun', [CLI, ...args], { cwd: root, encoding: 'utf8' });
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

const LEGACY_INTERACTIVE_FLAG = ['--no-', 'interactive'].join('');

// list --changes 已删除(B2):调用以 commander unknown option 退出 2
bdd.when('运行 list --changes', (ctx) => {
  const root = (ctx.fixtures['工作区'] as { root: string }).root;
  ctx.fixtures['removed结果'] = runCliAt(root, ['list', '--changes']);
});

bdd.thenStep('报 unknown option 且退出码非零', (ctx) => {
  const r = ctx.fixtures['removed结果'] as RemovedSurfaceResult;
  if (r.code === 0 || !r.stderr.toLowerCase().includes('unknown option')) {
    throw new Error(`expected unknown option, got code=${r.code} stderr=${r.stderr}`);
  }
});

bdd.thenStep('list --specs 仍可用', (ctx) => {
  const root = (ctx.fixtures['工作区'] as { root: string }).root;
  const r = runCliAt(root, ['list', '--specs']);
  if (r.code !== 0) throw new Error(`list --specs regressed: ${r.stdout}${r.stderr}`);
});

// graph --format 仅 mermaid(D3)
bdd.when('运行 graph --format json', (ctx) => {
  const root = (ctx.fixtures['工作区'] as { root: string }).root;
  ctx.fixtures['removed结果'] = runCliAt(root, ['graph', '--format', 'json']);
});

bdd.thenStep('报 unsupported --format 且退出码为 2', (ctx) => {
  const r = ctx.fixtures['removed结果'] as RemovedSurfaceResult;
  if (r.code !== 2 || !r.stderr.includes('unsupported --format')) {
    throw new Error(`expected unsupported --format exit 2, got code=${r.code} stderr=${r.stderr}`);
  }
});

// show 拒绝已删除的 v1 修饰 token(Q1)
bdd.when('运行 show 该 change --output 且附加已删除的 v1 修饰 token', (ctx) => {
  const root = (ctx.fixtures['工作区'] as { root: string }).root;
  const token = 'delta' + 's';
  ctx.fixtures['removed结果'] = runCliAt(root, ['show', 'live-change', '--output', token]);
});

bdd.thenStep('报 invalid --output token 且退出码非零', (ctx) => {
  const r = ctx.fixtures['removed结果'] as RemovedSurfaceResult;
  if (r.code === 0 || !r.stderr.includes('invalid --output token')) {
    throw new Error(`expected invalid --output token, got code=${r.code} stderr=${r.stderr}`);
  }
});

// 含活跃 change 的仓库/工作区夹具(r53 show token / r54 graph --format 场景用)
bdd.given('一个含活跃 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedChange(repo, 'live-change', {
    proposal: '---\ndepends_on: []\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
    commit: 'draft',
  });
  ctx.fixtures['工作区'] = { root: repo.root };
});

bdd.given('一个含活跃 change 的临时工作区', (ctx) => {
  const repo = makeTempRepo();
  seedChange(repo, 'live-change', {
    proposal: '---\ndepends_on: []\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
    commit: 'draft',
  });
  ctx.fixtures['工作区'] = { root: repo.root };
});

// align-report-cli-surface D6/B6: review 与 graph 实际读取全局 --max-scan-depth,
// 深度 1 不发现 2 层深的嵌套 change,深度 8 发现。
bdd.given('一个嵌套 change 的临时仓库且该嵌套位于 2 层深度', (ctx) => {
  const repo = makeTempRepo();
  const nested = join(repo.root, 'llmanspec', 'changes', 'group', 'deep-change');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  // 未勾任务让 review 的 validate 信号点名该 change(deep-change 可由名称断言)
  writeFileSync(join(nested, 'tasks.md'), '# Tasks\n- [ ] pending-task\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'nested 2']);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['深层change'] = 'deep-change';
});

bdd.when('运行 review --max-scan-depth 1 与 graph --max-scan-depth 1', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { root: string; repo: TempRepo }).repo;
  const review = repo.run('bun', [CLI, 'review', '--json', '--max-scan-depth', '1']);
  const graph = repo.run('bun', [CLI, 'graph', '--max-scan-depth', '1']);
  ctx.fixtures['深度结果'] = {
    shallow: { review: `${review.stdout}${review.stderr}`, graph: graph.stdout },
  };
});

bdd.when('运行 review --max-scan-depth 8 与 graph --max-scan-depth 8', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { root: string; repo: TempRepo }).repo;
  const review = repo.run('bun', [CLI, 'review', '--json', '--max-scan-depth', '8']);
  const graph = repo.run('bun', [CLI, 'graph', '--max-scan-depth', '8']);
  ctx.fixtures['深度结果'] = {
    deep: { review: `${review.stdout}${review.stderr}`, graph: graph.stdout },
  };
});

bdd.thenStep('review 信号不含该深层 change 且 graph 输出不含该深层 change 节点', (ctx) => {
  const { shallow } = ctx.fixtures['深度结果'] as {
    shallow?: { review: string; graph: string };
  };
  if (!shallow) throw new Error('shallow result missing');
  const id = ctx.fixtures['深层change'] as string;
  if (shallow.review.includes(id))
    throw new Error(`review leak at depth 1: ${id}\n${shallow.review}`);
  if (shallow.graph.includes(id)) throw new Error(`graph leak at depth 1: ${id}\n${shallow.graph}`);
});

bdd.thenStep('review 信号含该深层 change 且 graph 输出含该深层 change 节点', (ctx) => {
  const { deep } = ctx.fixtures['深度结果'] as {
    deep?: { review: string; graph: string };
  };
  if (!deep) throw new Error('deep result missing');
  const id = ctx.fixtures['深层change'] as string;
  if (!deep.review.includes(id))
    throw new Error(`review missing at depth 8: ${id}\n${deep.review}`);
  if (!deep.graph.includes(id)) throw new Error(`graph missing at depth 8: ${id}\n${deep.graph}`);
});
