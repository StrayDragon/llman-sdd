// Domain step definitions: `spec unbound` (peripheral-commands r89). Covers
// the implementation-readiness feed contract — default limit 1 + remaining
// hint, --limit 0 = all, deterministic ordering (file order + rule order),
// the runnable-scenario definition (@skip/@experimental-only counts as
// unbound), and the zero-unbound case. CLI subprocess seam (S2).
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, type TempRepo, makeTempRepo, runCli } from './shared.ts';

interface UnboundResult {
  code: number;
  stdout: string;
  stderr: string;
}

const HEADER = (cap: string): string =>
  `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n`;

const ALPHA = `${HEADER('alpha')}
  @req:r1
  规则: 已绑定需求
    已绑定需求描述。

    场景: 验收
      假如 状态
      当 动作
      那么 结果

  @req:r2
  规则: 裸需求
    裸需求描述。

  @req:r3
  规则: 全跳过需求
    全跳过需求描述。

    @skip
    场景: 跳过验收
      当 动作
      那么 结果
`;

const BETA = `${HEADER('beta')}
  @req:r4
  规则: 另一个裸需求
    另一个裸需求描述。
`;

const ONLY_BOUND = `${HEADER('gamma')}
  @req:r5
  规则: 已绑定需求
    已绑定需求描述。

    场景: 验收
      假如 状态
      当 动作
      那么 结果
`;

function seedSpecs(content: Record<string, string>): TempRepo {
  const repo = makeTempRepo();
  // the factory's bare-rule sample spec would add a 4th unbound requirement;
  // remove it so the fixture counts are exact (r2/r3/r4 only).
  rmSync(join(repo.root, 'llmanspec', 'specs', 'sample.feature'));
  for (const [name, body] of Object.entries(content)) {
    writeFileSync(join(repo.root, 'llmanspec', 'specs', name), body);
  }
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'specs']);
  return repo;
}

bdd.given('一个含未绑定需求的临时 specs 目录', (ctx) => {
  const repo = seedSpecs({ 'alpha.feature': ALPHA, 'beta.feature': BETA });
  ctx.fixtures['unbound仓库'] = { repo };
  return ctx.fixtures['unbound仓库'];
});

bdd.given('一个全部绑定需求的临时 specs 目录', (ctx) => {
  const repo = seedSpecs({ 'gamma.feature': ONLY_BOUND });
  ctx.fixtures['unbound仓库'] = { repo };
  return ctx.fixtures['unbound仓库'];
});

bdd.when('运行 spec unbound', (ctx) => {
  const { repo } = ctx.fixtures['unbound仓库'] as { repo: TempRepo };
  const proc = runCli(['spec', 'unbound'], repo.root);
  const result: UnboundResult = {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
  ctx.fixtures['unbound结果'] = result;
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

bdd.when('运行 spec unbound --limit {limit:d} --json', (ctx, limit: number) => {
  const { repo } = ctx.fixtures['unbound仓库'] as { repo: TempRepo };
  const proc = runCli(['spec', 'unbound', '--limit', String(limit), '--output', 'json'], repo.root);
  const result: UnboundResult = {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
  ctx.fixtures['unbound结果'] = result;
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

bdd.when('运行 spec unbound --output human', (ctx) => {
  const { repo } = ctx.fixtures['unbound仓库'] as { repo: TempRepo };
  const proc = runCli(['spec', 'unbound', '--output', 'human'], repo.root);
  const result: UnboundResult = {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
  ctx.fixtures['unbound结果'] = result;
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

bdd.thenStep('unbound 输出含 "{text}"', (ctx, text: string) => {
  const r = ctx.fixtures['unbound结果'] as UnboundResult;
  if (!`${r.stdout}${r.stderr}`.includes(text)) {
    throw new Error(`unbound output lacks "${text}":\n${r.stdout}${r.stderr}`);
  }
});

bdd.thenStep(
  'unbound JSON 的 total 为 {total:d} 且 requirements 为 {count:d} 条',
  (ctx, total, count) => {
    const r = ctx.fixtures['unbound结果'] as UnboundResult;
    let parsed: { total?: number; returned?: number; remaining?: number; requirements?: unknown[] };
    try {
      parsed = JSON.parse(r.stdout);
    } catch (error) {
      throw new Error(`unbound stdout is not JSON: ${r.stdout}\n${(error as Error).message}`, {
        cause: error,
      });
    }
    if (parsed.total !== total) throw new Error(`expected total ${total}, got ${parsed.total}`);
    if ((parsed.requirements ?? []).length !== count) {
      throw new Error(`expected ${count} requirements, got ${(parsed.requirements ?? []).length}`);
    }
  },
);

bdd.thenStep('unbound JSON 的 reqId 序列恰为 "{list}"', (ctx, list: string) => {
  const r = ctx.fixtures['unbound结果'] as UnboundResult;
  const parsed = JSON.parse(r.stdout) as {
    requirements: { reqId: string }[];
  };
  const got = parsed.requirements.map((x) => x.reqId);
  const want = list.split(',').map((x) => x.trim());
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`expected reqIds ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
});

bdd.thenStep('unbound JSON 的 remaining 与 hint 为空且 total 为 0', (ctx) => {
  const r = ctx.fixtures['unbound结果'] as UnboundResult;
  const parsed = JSON.parse(r.stdout) as {
    total: number;
    remaining: number;
    hint: string;
    requirements: unknown[];
  };
  if (parsed.total !== 0) throw new Error(`expected total 0, got ${parsed.total}`);
  if (parsed.remaining !== 0) throw new Error(`expected remaining 0, got ${parsed.remaining}`);
  if (parsed.hint !== '')
    throw new Error(`expected empty hint, got ${JSON.stringify(parsed.hint)}`);
});

bdd.thenStep('unbound 单条含 reqId 与文件路径', (ctx) => {
  const r = ctx.fixtures['unbound结果'] as UnboundResult;
  const parsed = JSON.parse(r.stdout) as {
    requirements: { reqId: string; featurePath: string; capability: string }[];
  };
  if (parsed.requirements.length !== 1) {
    throw new Error(`expected exactly one requirement, got ${parsed.requirements.length}`);
  }
  const it = parsed.requirements[0]!;
  if (!it.reqId || !it.featurePath.includes('.feature') || !it.capability) {
    throw new Error(`requirement shape wrong: ${JSON.stringify(it)}`);
  }
});
