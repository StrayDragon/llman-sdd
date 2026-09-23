// Domain step definitions: context-index 能力 — 覆盖 r26/r27(rebuild 后
// check fresh / 改 spec 后 stale 循环)与 r62(无索引时 context 查询的
// lazy 重建契约)。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, type TempRepo, makeTempRepo } from './shared.ts';

// ---------------------------------------------------------------------------
// context-index capability — rebuild/check freshness cycle + env contract
// ---------------------------------------------------------------------------

interface CheckResult {
  exitCode: number;
  output: string;
}

bdd.given('一个含 specs 的临时仓库', (ctx) => {
  ctx.fixtures['idx仓库'] = { repo: makeTempRepo() };
});

bdd.when('rebuild 后立即 check', (ctx) => {
  const repo = (ctx.fixtures['idx仓库'] as { repo: TempRepo }).repo;
  repo.run('bun', [CLI, 'index', 'rebuild']);
  const check = repo.run('bun', [CLI, 'index', 'check']);
  ctx.fixtures['check结果'] = {
    exitCode: check.code,
    output: check.stdout,
  } satisfies CheckResult;
});

bdd.thenStep('报告 fresh', (ctx) => {
  const result = ctx.fixtures['check结果'] as CheckResult | undefined;
  if (result?.exitCode !== 0 || !result.output.includes('fresh')) {
    throw new Error(`expected fresh, got exit=${result?.exitCode} output=${result?.output}`);
  }
});

bdd.when('修改任一 spec 后再 check', (ctx) => {
  const repo = (ctx.fixtures['idx仓库'] as { repo: TempRepo }).repo;
  const specPath = join(repo.root, 'llmanspec', 'specs', 'sample.feature');
  writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n# touched\n`);
  const check = repo.run('bun', [CLI, 'index', 'check']);
  ctx.fixtures['check结果'] = {
    exitCode: check.code,
    output: check.stdout,
  } satisfies CheckResult;
});

bdd.thenStep('报告 stale', (ctx) => {
  const result = ctx.fixtures['check结果'] as CheckResult | undefined;
  if (!result) throw new Error('no check result');
  if (result.exitCode === 0 || !result.output.includes('stale')) {
    throw new Error(`expected stale, got exit=${result.exitCode} output=${result.output}`);
  }
});

// ---------------------------------------------------------------------------
// r62 — context index lazy refresh (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含 specs 但无 .context 索引的临时仓库', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-ctx-'));
  const specsDir = join(root, 'llmanspec', 'specs');
  mkdirSync(specsDir, { recursive: true });
  writeFileSync(
    join(specsDir, 'demo.feature'),
    '# language: zh-CN\n# capability: demo\n# purpose: p\n# scope: .\n\n功能: demo\n\n  @req:r1 @human\n  场景: 规则\n    - 系统 MUST x\n',
  );
  ctx.fixtures['ctx仓库'] = { root };
});

bdd.when('运行 context 查询', (ctx) => {
  const { root } = ctx.fixtures['ctx仓库'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'context', '--paths', 'llmanspec/specs'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['ctx结果'] = { stdout: proc.stdout ?? '', status: proc.status ?? 1 };
});

bdd.thenStep('索引被自动重建且不因 missing 返回 unavailable', (ctx) => {
  const { root } = ctx.fixtures['ctx仓库'] as { root: string };
  const r = ctx.fixtures['ctx结果'] as { stdout: string; status: number };
  if (r.status !== 0) throw new Error(`context exited non-zero: ${r.stdout}`);
  if (!existsSync(join(root, 'llmanspec', '.context', 'pageindex', 'tree.json'))) {
    throw new Error('tree.json was not auto-rebuilt');
  }
  const parsed = JSON.parse(r.stdout) as { status?: { errorKind?: string } };
  if (parsed.status?.errorKind === 'index_rebuild_failed') {
    throw new Error(`unexpected rebuild failure: ${r.stdout}`);
  }
});
