// Multi-root acceptance steps (subproject-llmanspec-discovery r91-r94):
// aggregate validate, single-ownership ERROR, sub-root init skills policy,
// per-root req registry.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, makeTempRepo, type TempRepo } from './shared.ts';

const SUB = 'packages/tui';
const subRootOf = (repo: TempRepo): string => join(repo.root, SUB);

function seedSubRoot(repo: TempRepo, checkCommand?: string): void {
  mkdirSync(join(subRootOf(repo), 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(
    join(subRootOf(repo), 'llmanspec', 'config.yaml'),
    checkCommand === undefined
      ? 'schema: spec-driven\n'
      : `schema: spec-driven\nspecs:\n  check_command: "${checkCommand}"\n`,
  );
  writeFileSync(
    join(subRootOf(repo), 'llmanspec', 'specs', 'tuicap.feature'),
    '# language: zh-CN\n# capability: tuicap\n# purpose: p\n# scope: tests/\n\n功能: tuicap\n\n  @req:r5\n  规则: 子规则\n    系统 MUST y\n',
  );
  mkdirSync(join(subRootOf(repo), 'tests'), { recursive: true });
}

function seedRootCheck(repo: TempRepo, checkCommand: string): void {
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    `schema: spec-driven\nspecs:\n  check_command: "${checkCommand}"\n`,
  );
}

interface RunResult {
  code: number;
  out: string;
}

bdd.given('一个含根与子根双 llmanspec 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo, 'echo tui-ok');
  seedRootCheck(repo, 'echo root-ok');
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.given('一个子根 check_command 失败的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo, 'false');
  seedRootCheck(repo, 'echo root-ok');
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('运行 validate --specs --all-roots', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = repo.run('bun', [CLI, 'validate', '--specs', '--all-roots']);
  ctx.fixtures['聚合结果'] = { code: r.code, out: `${r.stdout}${r.stderr}` } satisfies RunResult;
});

bdd.thenStep('聚合输出按根分组且两根各执行一次', (ctx) => {
  const r = ctx.fixtures['聚合结果'] as RunResult;
  if (r.code !== 0) throw new Error(`aggregate validate failed: ${r.out}`);
  // The sub-root label only appears in grouped output; the aggregate summary
  // totals both roots' single specs.
  if (!r.out.includes('packages/tui')) throw new Error(`sub-root missing from output:\n${r.out}`);
  if (!r.out.includes('items: 2')) throw new Error(`aggregate totals not 2:\n${r.out}`);
});

bdd.thenStep('聚合退出码非零', (ctx) => {
  const r = ctx.fixtures['聚合结果'] as RunResult;
  if (r.code === 0) throw new Error(`failing sub-root did not fail the aggregate:\n${r.out}`);
});

bdd.given('一个根 specs scope 指向子包且子包携带 llmanspec 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'violator.feature'),
    '# language: zh-CN\n# capability: violator\n# purpose: p\n# scope: packages/tui/\n\n功能: violator\n\n  @req:r2\n  规则: 越界规则\n    系统 MUST z\n',
  );
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('在双根仓库运行 validate --specs', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = repo.run('bun', [CLI, 'validate', '--specs']);
  ctx.fixtures['聚合结果'] = { code: r.code, out: `${r.stdout}${r.stderr}` } satisfies RunResult;
});

bdd.thenStep('该 spec 报 single-ownership 错误且列出冲突路径与两侧根', (ctx) => {
  const r = ctx.fixtures['聚合结果'] as RunResult;
  if (!r.out.includes('single-ownership')) throw new Error(`no ownership ERROR:\n${r.out}`);
  if (!r.out.includes('packages/tui')) throw new Error(`crossing path missing:\n${r.out}`);
  if (r.code === 0) throw new Error('single-ownership ERROR must fail validation');
});

bdd.given('一个 git 仓库的临时目录', (ctx) => {
  ctx.fixtures['双根仓库'] = { repo: makeTempRepo() };
});

bdd.when('运行 init packages/tui 与 init packages/tui --skills', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const first = repo.run('bun', [CLI, 'init', SUB]);
  const skillsAfterDefault = existsSync(join(subRootOf(repo), '.agents', 'skills'));
  const second = repo.run('bun', [CLI, 'init', SUB, '--skills']);
  ctx.fixtures['子根init结果'] = {
    firstCode: first.code,
    firstOut: `${first.stdout}${first.stderr}`,
    skillsAfterDefault,
    secondCode: second.code,
    skillsAfterFlag: existsSync(join(subRootOf(repo), '.agents', 'skills')),
  };
});

bdd.thenStep('子根双托管块写入且缺省无 .agents/skills 且 --skills 后注入', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['子根init结果'] as {
    firstCode: number;
    firstOut: string;
    skillsAfterDefault: boolean;
    secondCode: number;
    skillsAfterFlag: boolean;
  };
  if (r.firstCode !== 0) throw new Error(`sub-root init failed: ${r.firstOut}`);
  const agents = readFileSync(join(subRootOf(repo), 'AGENTS.md'), 'utf8');
  if (!agents.includes('LLMANSPEC:START')) throw new Error('sub-root managed block missing');
  if (r.skillsAfterDefault) throw new Error('sub-root default must not inject skills');
  if (r.secondCode !== 0) throw new Error('sub-root init --skills failed');
  if (!r.skillsAfterFlag) throw new Error('--skills did not inject');
});

bdd.given('一个子根含 r5 规则的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  writeFileSync(
    join(subRootOf(repo), 'llmanspec', 'specs', 'tuicap.feature'),
    '# language: zh-CN\n# capability: tuicap\n# purpose: p\n# scope: tests/\n\n功能: tuicap\n\n  @req:r5\n  规则: 子规则\n    系统 MUST y\n',
  );
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('运行 spec next-req-id 于子根', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, 'spec', 'next-req-id'], {
    cwd: subRootOf(repo),
    encoding: 'utf8',
    env,
  });
  ctx.fixtures['子根取号'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  } satisfies RunResult;
});

bdd.thenStep('输出 r6 而非根部空缺号', (ctx) => {
  const r = ctx.fixtures['子根取号'] as RunResult;
  if (r.code !== 0) throw new Error(`next-req-id failed: ${r.out}`);
  // sub-root max is r5 -> r6; the root registry only holds r1 (a smallest-free
  // scan of the wrong root would alias the retired r2-r4 gap).
  if (!r.out.includes('r6')) throw new Error(`expected sub-root r6, got:\n${r.out}`);
});
