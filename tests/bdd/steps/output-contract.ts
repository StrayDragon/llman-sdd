// Domain step definitions: 读命令输出合同批 — 覆盖 r21(show --output json
// 字段集 / show spec 原文 / graph mermaid 合同)、r22(spec skeleton /
// next-req-id / project migrate 三态)、r51-r53(list compact-json 排序 /
// show 文本与 JSON 门 / show --output human 变体)。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCapability } from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI, makeTempRepo, type TempRepo, runCli } from './shared.ts';

// ---------------------------------------------------------------------------
// r51-r53 — list sort / show text & gates / spec inspect (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含多个 change 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-list-'));
  for (const name of ['beta-feat', 'alpha-feat']) {
    const dir = join(root, 'llmanspec', 'changes', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'proposal.md'),
      '---\ndepends_on: []\n---\n\n## Why\nx\n## What Changes\ny\n',
    );
  }
  ctx.fixtures['list工作区'] = { root };
});

bdd.when('运行 list --json --compact-json --sort name', (ctx) => {
  const { root } = ctx.fixtures['list工作区'] as { root: string };
  const proc = runCli(['list', '--json', '--compact-json', '--sort', 'name'], root);
  const lines = (proc.stdout ?? '').trim().split('\n');
  let names: string[] = [];
  try {
    names = (JSON.parse(lines[0] as string) as { changes: { name: string }[] }).changes.map(
      (c) => c.name,
    );
  } catch {
    // then-step reports
  }
  ctx.fixtures['list结果'] = { singleLine: lines.length === 1, names, code: proc.status ?? 1 };
});

bdd.thenStep('单行 JSON 输出且顺序为字典序', (ctx) => {
  const r = ctx.fixtures['list结果'] as { singleLine: boolean; names: string[]; code: number };
  if (r.code !== 0) throw new Error('list failed');
  if (!r.singleLine) throw new Error('compact-json must be a single line');
  if (r.names.join(',') !== 'alpha-feat,beta-feat')
    throw new Error(`order wrong: ${r.names.join(',')}`);
});

bdd.given('一个缺 What Changes 段的 change 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-showg-'));
  const dir = join(root, 'llmanspec', 'changes', 'gated');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  ctx.fixtures['show工作区'] = { root };
});

bdd.when('运行 show', (ctx) => {
  const { root } = ctx.fixtures['show工作区'] as { root: string };
  const proc = runCli(['show', 'gated', '--output', 'human'], root);
  ctx.fixtures['show结果'] = {
    beforeCode: proc.status ?? 0,
    beforeOut: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.when('运行 show --output json', (ctx) => {
  const { root } = ctx.fixtures['show工作区'] as { root: string };
  const proc = runCli(['show', 'gated', '--output', 'json'], root);
  ctx.fixtures['showjson结果'] = {
    code: proc.status ?? 0,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.when('补齐 What Changes 后再运行 show', (ctx) => {
  const { root } = ctx.fixtures['show工作区'] as { root: string };
  writeFileSync(
    join(root, 'llmanspec', 'changes', 'gated', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\nx\n## What Changes\ny\n',
  );
  const proc = runCli(['show', 'gated', '--output', 'human'], root);
  ctx.fixtures['show后结果'] = { afterCode: proc.status ?? 1, afterOut: proc.stdout ?? '' };
});

bdd.thenStep('文本模式不设门且输出 Stage', (ctx) => {
  const r = ctx.fixtures['show结果'] as { beforeCode: number; beforeOut: string };
  // v1 parity: text/compact mode renders changes without Why/What Changes gates.
  if (r.beforeCode !== 0) throw new Error(`text show should render: ${r.beforeOut}`);
  if (!r.beforeOut.includes('Stage:')) throw new Error(`Stage line missing: ${r.beforeOut}`);
  if (!r.beforeOut.includes('Gates:')) throw new Error(`Gates trailer missing: ${r.beforeOut}`);
});

bdd.thenStep('--output json 受 What Changes 门拦截', (ctx) => {
  const r = ctx.fixtures['showjson结果'] as { code: number; out: string };
  if (r.code === 0) throw new Error(`json show should gate: ${r.out}`);
  if (!r.out.includes('What Changes'))
    throw new Error(`What Changes gate message missing: ${r.out}`);
});

bdd.thenStep('输出含 Stage 的文本', (ctx) => {
  const r = ctx.fixtures['show后结果'] as { afterCode: number; afterOut: string };
  if (r.afterCode !== 0) throw new Error(`show text failed: ${r.afterOut}`);
  if (!r.afterOut.includes('Stage:')) throw new Error(`Stage line missing: ${r.afterOut}`);
});

bdd.given('一个含多条规则的 spec 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-showspec-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'specs', 'multi.feature'),
    '# language: zh-CN\n# capability: multi\n# purpose: p\n# scope: llmanspec/\n\n功能: multi\n\n  @req:r1 @human\n  场景: 规则一\n    - 系统 MUST 一\n\n  @req:r2 @human\n  场景: 规则二\n    - 系统 MUST 二\n',
  );
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  ctx.fixtures['showspec工作区'] = { root };
});

bdd.when('运行 show --output human -r 1 与 show --output human,meta-only', (ctx) => {
  const { root } = ctx.fixtures['showspec工作区'] as { root: string };
  const req = runCli(['show', 'multi', '--output', 'human', '-r', '1'], root);
  const meta = runCli(['show', 'multi', '--output', 'human,meta-only'], root);
  ctx.fixtures['showspec结果'] = {
    reqOut: req.stdout ?? '',
    reqCode: req.status ?? 1,
    metaOut: meta.stdout ?? '',
    metaCode: meta.status ?? 1,
  };
});

bdd.thenStep('文本模式 -r 与 meta-only 均为全量渲染', (ctx) => {
  const r = ctx.fixtures['showspec结果'] as {
    reqOut: string;
    reqCode: number;
    metaOut: string;
    metaCode: number;
  };
  if (r.reqCode !== 0 || !r.reqOut.includes('规则一') || !r.reqOut.includes('规则二'))
    throw new Error(`-r must render the full spec in text (v1 parity): ${r.reqOut}`);
  if (r.metaCode !== 0 || !r.metaOut.includes('规则一') || !r.metaOut.includes('## Morphology'))
    throw new Error(`meta-only must render the full spec in text (v1 parity): ${r.metaOut}`);
});

// ---------------------------------------------------------------------------
// r21 — show json/spec + graph mermaid contract (acceptance)
// ---------------------------------------------------------------------------

interface ShowGraphResult {
  showJson: { code: number; stdout: string; stderr: string };
  showSpec: { code: number; stdout: string };
  graph: { code: number; stdout: string };
}

const SHOW_JSON_FIELDS = [
  'id',
  'path',
  'title',
  'stage',
  'artifacts',
  'readyToImplement',
  'specsLanded',
  'needsSpecsChange',
  'attached',
  'gateChecks',
  'matchedViaPrefix',
] as const;

bdd.given('一个含活跃 change 与归档依赖的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const changes = join(repo.root, 'llmanspec', 'changes');
  mkdirSync(join(changes, 'archive', '2026-01-01-done-old'), { recursive: true });
  writeFileSync(
    join(changes, 'archive', '2026-01-01-done-old', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\nx\n',
  );
  mkdirSync(join(changes, 'demo-change'), { recursive: true });
  writeFileSync(
    join(changes, 'demo-change', 'proposal.md'),
    '---\ndepends_on: [done-old]\n---\n\n## Why\nx\n\n## What Changes\ny\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'deps']);
  ctx.fixtures['showgraph仓库'] = { repo };
});

bdd.when('运行 show --output json 与 show spec 原文与 graph --format mermaid', (ctx) => {
  const repo = (ctx.fixtures['showgraph仓库'] as { repo: TempRepo }).repo;
  const json = repo.run('bun', [CLI, 'show', 'demo-change', '--output', 'json']);
  const spec = repo.run('bun', [CLI, 'show', 'sample', '--output', 'human']);
  const graph = repo.run('bun', [CLI, 'graph', '--format', 'mermaid']);
  ctx.fixtures['showgraph结果'] = {
    showJson: { code: json.code, stdout: json.stdout, stderr: json.stderr },
    showSpec: { code: spec.code, stdout: spec.stdout },
    graph: { code: graph.code, stdout: graph.stdout },
  } satisfies ShowGraphResult;
});

bdd.thenStep('show JSON 字段集完整覆盖 change 合同字段', (ctx) => {
  const r = ctx.fixtures['showgraph结果'] as ShowGraphResult;
  if (r.showJson.code !== 0) {
    throw new Error(`show --output json failed: ${r.showJson.stderr}`);
  }
  const parsed = JSON.parse(r.showJson.stdout) as Record<string, unknown>;
  const missing = SHOW_JSON_FIELDS.filter((f) => !(f in parsed));
  if (missing.length > 0) {
    throw new Error(`show json missing contract fields: ${missing.join(', ')}`);
  }
});

bdd.thenStep('show spec 直出头注释与 gherkin 原文', (ctx) => {
  const r = ctx.fixtures['showgraph结果'] as ShowGraphResult;
  if (r.showSpec.code !== 0) throw new Error(`show sample failed`);
  for (const marker of ['# language: zh-CN', '# capability: sample', '功能: sample', '场景: ok']) {
    if (!r.showSpec.stdout.includes(marker)) {
      throw new Error(`show spec output missing raw marker "${marker}":\n${r.showSpec.stdout}`);
    }
  }
});

bdd.thenStep('graph 以 flowchart TD 开头且节点下划线化并以 classDef archived 收尾', (ctx) => {
  const r = ctx.fixtures['showgraph结果'] as ShowGraphResult;
  if (r.graph.code !== 0) throw new Error(`graph failed`);
  if (r.graph.stdout.split('\n')[0]?.trim() !== 'flowchart TD') {
    throw new Error(`graph must start with flowchart TD:\n${r.graph.stdout}`);
  }
  for (const marker of [
    'demo_change["demo-change"]',
    'done_old["done-old ✓ done"]:::archived',
    'demo_change -->|depends on| done_old',
  ]) {
    if (!r.graph.stdout.includes(marker)) {
      throw new Error(`graph output missing "${marker}":\n${r.graph.stdout}`);
    }
  }
  const last = r.graph.stdout.split('\n').findLast((l) => l.trim() !== '');
  if (!last?.trim().startsWith('classDef archived')) {
    throw new Error(`graph must end with classDef archived, got: ${last}`);
  }
});

// ---------------------------------------------------------------------------
// r22 — spec helpers + project migrate three states (acceptance)
// ---------------------------------------------------------------------------

interface MigrateResult {
  skeletonCode: number;
  skeletonContent: string;
  nextReqId: string;
  bareOut: string;
  toonOut: string;
  flattenOut: string;
  unknownCode: number;
  unknownOut: string;
}

bdd.given('一个已初始化且含 r1 规则的临时仓库', (ctx) => {
  ctx.fixtures['migrate仓库'] = { repo: makeTempRepo() };
});

bdd.when('运行 spec skeleton 与 next-req-id 与 project migrate 三态', (ctx) => {
  const repo = (ctx.fixtures['migrate仓库'] as { repo: TempRepo }).repo;
  const skel = repo.run('bun', [CLI, 'spec', 'skeleton', 'capx']);
  const skeletonContent =
    skel.code === 0
      ? readFileSync(join(repo.root, 'llmanspec', 'specs', 'capx.feature'), 'utf8')
      : '';
  const next = repo.run('bun', [CLI, 'spec', 'next-req-id', '--json']);
  const bare = repo.run('bun', [CLI, 'project', 'migrate']);
  const toon = repo.run('bun', [CLI, 'project', 'migrate', '--kind', 'toon2features']);
  const flatten = repo.run('bun', [CLI, 'project', 'migrate', '--kind', 'specs-flatten']);
  const unknown = repo.run('bun', [CLI, 'project', 'migrate', '--kind', 'bogus']);
  let nextReqId = '';
  try {
    nextReqId = String((JSON.parse(next.stdout || '{}') as { reqId?: string }).reqId ?? '');
  } catch {
    // then-step reports the failure
  }
  ctx.fixtures['migrate结果'] = {
    skeletonCode: skel.code,
    skeletonContent,
    nextReqId,
    bareOut: bare.stdout,
    toonOut: toon.stdout,
    flattenOut: flatten.stdout,
    unknownCode: unknown.code,
    unknownOut: `${unknown.stdout}${unknown.stderr}`,
  } satisfies MigrateResult;
});

bdd.thenStep('skeleton 产物过单轨校验且 next-req-id 输出下一空闲 id', (ctx) => {
  const r = ctx.fixtures['migrate结果'] as MigrateResult;
  if (r.skeletonCode !== 0) throw new Error('spec skeleton failed');
  const doc = parseCapability(r.skeletonContent, 'capx.feature');
  if (doc.errors.length !== 0) {
    throw new Error(`skeleton fails single-track validation: ${JSON.stringify(doc.errors)}`);
  }
  // makeTempRepo 的 sample.feature 占 r1:skeleton 领走下一空闲 id r2,
  // 随后 next-req-id 扫描全局注册表应报再下一个空闲 id r3。
  if (!r.skeletonContent.includes('@req:r2 @human')) {
    throw new Error(`skeleton did not claim the next free id r2:\n${r.skeletonContent}`);
  }
  if (r.nextReqId !== 'r3') {
    throw new Error(`expected next free id r3, got "${r.nextReqId}"`);
  }
});

bdd.thenStep('migrate 裸调用输出总览且两种 kind 各输出协作说明', (ctx) => {
  const r = ctx.fixtures['migrate结果'] as MigrateResult;
  // 总览含两种 --kind 提示(输出文案随 config locale 变化,断言取语言中立标记)
  for (const marker of ['toon2features', 'specs-flatten']) {
    if (!r.bareOut.includes(marker)) {
      throw new Error(`bare migrate overview missing "${marker}":\n${r.bareOut}`);
    }
  }
  if (!r.toonOut.includes('spec.toon')) {
    throw new Error(`toon2features guidance missing:\n${r.toonOut}`);
  }
  if (!r.flattenOut.includes('git mv')) {
    throw new Error(`specs-flatten guidance missing:\n${r.flattenOut}`);
  }
});

bdd.thenStep('未知 --kind 退出码非零', (ctx) => {
  const r = ctx.fixtures['migrate结果'] as MigrateResult;
  if (r.unknownCode === 0) throw new Error(`unknown kind must exit non-zero: ${r.unknownOut}`);
  if (!r.unknownOut.includes('unknown migration kind')) {
    throw new Error(`unexpected error output: ${r.unknownOut}`);
  }
});

// align-report-cli-surface B18:spec skeleton 不再创建仓库根 src/,
// 骨架 # scope: 指向 llmanspec/(本地化兼容单轨校验)。
bdd.when('运行 spec skeleton', (ctx) => {
  const repo = (ctx.fixtures['migrate仓库'] as { repo: TempRepo }).repo;
  const skel = repo.run('bun', [CLI, 'spec', 'skeleton', 'capx']);
  const content =
    skel.code === 0
      ? readFileSync(join(repo.root, 'llmanspec', 'specs', 'capx.feature'), 'utf8')
      : '';
  ctx.fixtures['skeleton结果'] = { code: skel.code, content };
});

bdd.thenStep('骨架通过单轨校验且 # scope: 指向 llmanspec/ 而非 src/', (ctx) => {
  const r = ctx.fixtures['skeleton结果'] as { code: number; content: string };
  if (r.code !== 0) throw new Error('spec skeleton failed');
  const doc = parseCapability(r.content, 'capx.feature');
  if (doc.errors.length > 0)
    throw new Error(`skeleton fails single-track validation: ${JSON.stringify(doc.errors)}`);
  if (!r.content.includes('# scope: llmanspec/')) {
    throw new Error(`skeleton does not point scope at llmanspec/:\n${r.content}`);
  }
  if (r.content.includes('# scope: src/')) {
    throw new Error(`skeleton still references src/ scope:\n${r.content}`);
  }
});

bdd.thenStep('仓库根无 src/ 目录', (ctx) => {
  const repo = (ctx.fixtures['migrate仓库'] as { repo: TempRepo }).repo;
  if (existsSync(join(repo.root, 'src'))) throw new Error('repo-root src/ directory created');
});
