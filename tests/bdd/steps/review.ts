// Domain step definitions: review-freeze 能力 — 覆盖 r23/r25(v2 review
// 五类信号与 criticalCount 退出码一致、v1 freeze → v2 thaw 回置)与 r33
// (review --capability 过滤:locked/validate 保持全局)。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, type CliResult, type TempRepo, makeTempRepo, runCli } from './shared.ts';

// ---------------------------------------------------------------------------
// review-freeze capability — live v1 ↔ v2 review + v1 freeze → v2 thaw
// ---------------------------------------------------------------------------

bdd.when('v2 运行 review', (ctx) => {
  const proc = runCli(['review', '--json']);
  const out = proc.stdout ?? '';
  try {
    const parsed = JSON.parse(out) as {
      signals: { kind: string }[];
      summary: Record<string, number>;
    };
    const kinds = new Set(parsed.signals.map((s) => s.kind));
    ctx.fixtures['review'] = {
      kinds,
      summary: parsed.summary,
      exitCode: proc.status ?? 1,
    };
  } catch (error) {
    throw new Error(`review --json invalid: ${(error as Error).message}\n${out.slice(0, 300)}`, {
      cause: error,
    });
  }
});

bdd.thenStep('signals 覆盖五种 kind', (ctx) => {
  const kinds = (ctx.fixtures['review'] as { kinds: Set<string> }).kinds;
  for (const kind of ['pending', 'unbound', 'stale', 'locked', 'validate']) {
    if (!kinds.has(kind)) throw new Error(`missing signal kind: ${kind}`);
  }
});

bdd.thenStep('summary 含 criticalCount 与 warningCount', (ctx) => {
  const summary = (ctx.fixtures['review'] as { summary: Record<string, number> }).summary;
  if (typeof summary['criticalCount'] !== 'number' || typeof summary['warningCount'] !== 'number') {
    throw new TypeError(`summary missing counts: ${JSON.stringify(summary)}`);
  }
});

bdd.given('一个含已归档目录的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const archiveDir = join(repo.root, 'llmanspec', 'changes', 'archive');
  mkdirSync(join(archiveDir, '2026-01-01-old-demo'), { recursive: true });
  writeFileSync(join(archiveDir, '2026-01-01-old-demo', 'proposal.md'), '# frozen demo\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'archive dir']);
  ctx.fixtures['冻结仓库'] = { root: repo.root, repo };
});

bdd.when('v2 运行 freeze 后再 thaw 回置该目录', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as { repo: TempRepo }).repo;
  const freeze = repo.run('bun', [CLI, 'archive', 'freeze', '--before', '2026-02-01']);
  if (freeze.code !== 0) {
    throw new Error(`v2 freeze failed:\n${freeze.stdout}`);
  }
  const thaw = repo.run('bun', [CLI, 'archive', 'thaw', '--change', '2026-01-01-old-demo']);
  ctx.fixtures['thaw结果'] = {
    exitCode: thaw.code,
    stdout: thaw.stdout,
  } satisfies CliResult;
});

bdd.thenStep('目录完整回到 changes/archive 下', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as { repo: TempRepo }).repo;
  if (!existsSync(join(repo.root, 'llmanspec/changes/archive/2026-01-01-old-demo/proposal.md'))) {
    throw new Error('thawed dir missing proposal.md');
  }
});

bdd.thenStep('内容与冻结前一致', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as { repo: TempRepo }).repo;
  const content = readFileSync(
    join(repo.root, 'llmanspec/changes/archive/2026-01-01-old-demo/proposal.md'),
    'utf8',
  );
  if (!content.includes('# frozen demo')) throw new Error(`content drifted: ${content}`);
});

bdd.thenStep('退出码与 criticalCount 一致', (ctx) => {
  const review = ctx.fixtures['review'] as
    | {
        exitCode: number;
        summary: { criticalCount: number };
      }
    | undefined;
  if (!review) throw new Error('no review fixture');
  const expected = review.summary.criticalCount > 0 ? 1 : 0;
  if (review.exitCode !== expected) {
    throw new Error(
      `exit ${review.exitCode} inconsistent with criticalCount ${review.summary.criticalCount}`,
    );
  }
});

// ---------------------------------------------------------------------------
// r33 — review --capability filter (acceptance)
// ---------------------------------------------------------------------------

interface ReviewFilterResult {
  signals: { kind: string; capability: string }[];
}

bdd.when('运行 v2 的 review --json 并限定单一 capability', (ctx) => {
  const proc = runCli(['review', '--json', '--capability', 'peripheral-commands']);
  let signals: { kind: string; capability: string }[] = [];
  try {
    signals = (JSON.parse(proc.stdout ?? '{}') as ReviewFilterResult).signals ?? [];
  } catch {
    // leave empty — the then-step will fail with a clear message
  }
  ctx.fixtures['review过滤'] = { signals };
});

bdd.thenStep('三类信号仅含该 capability 且 locked 与 validate 保持全局', (ctx) => {
  const { signals } = ctx.fixtures['review过滤'] as ReviewFilterResult;
  const perCap = signals.filter((s) => s.kind !== 'locked' && s.kind !== 'validate');
  if (perCap.length === 0) throw new Error('no per-capability signals emitted');
  const strangers = perCap.filter((s) => s.capability !== 'peripheral-commands');
  if (strangers.length > 0) {
    throw new Error(`filter leaked other capabilities: ${JSON.stringify(strangers)}`);
  }
  if (!signals.some((s) => s.kind === 'locked')) throw new Error('locked signal missing');
  if (!signals.some((s) => s.kind === 'validate')) throw new Error('validate signal missing');
});
