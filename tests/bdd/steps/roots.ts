// Multi-root acceptance steps (subproject-llmanspec-discovery r91-r94):
// aggregate validate, single-ownership non-regression (scope-boundaries r117),
// sub-root init skills policy, per-root req registry.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import {
  CLI,
  makeTempRepo,
  runCli,
  seedRootCheck,
  seedSubRoot,
  subRootOf,
  SUB,
  type TempRepo,
} from './shared.ts';

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

// Opt-in harness (r13): aggregate only runs the per-root check_command with --check.
bdd.when('运行 validate --specs --all-roots --check', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = repo.run('bun', [CLI, 'validate', '--specs', '--all-roots', '--check']);
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

bdd.thenStep('越界 scope 只作报告制观察且 validate --specs 仍绿', (ctx) => {
  const r = ctx.fixtures['聚合结果'] as RunResult;
  // r117:路径单一归属自 0.8.0 起为报告制观察面而非错误门——命中另一个已存在的
  // 实例目录 MUST NOT 报 ERROR、MUST NOT 使 validate 失败。
  if (r.out.includes('single-ownership')) {
    throw new Error(`single-ownership gate must not be revived:\n${r.out}`);
  }
  if (r.code !== 0) throw new Error(`crossing scope must stay green:\n${r.out}`);
  // 非空断言:该 spec 确实被校验过,否则本场景会因空跑而恒绿。
  if (!r.out.includes('violator')) throw new Error(`spec was not validated at all:\n${r.out}`);
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

// ---------------------------------------------------------------------------
// r93 per-workspace sweep — sub-root --update refreshes every discovered root
// ---------------------------------------------------------------------------

const tamperManagedBlock = (path: string): void => {
  const s = readFileSync(path, 'utf8');
  writeFileSync(
    path,
    s.replace('<!-- LLMANSPEC:START -->\n', '<!-- LLMANSPEC:START -->\nTAMPER-MARK\n'),
  );
};

bdd.given('一个含根实例与子根实例的 git 仓库且两实例托管块均被篡改', (ctx) => {
  const repo = makeTempRepo();
  const rootInit = repo.run('bun', [CLI, 'init']);
  const subInit = repo.run('bun', [CLI, 'init', SUB]);
  if (rootInit.code !== 0) throw new Error(`root init failed: ${rootInit.stderr}`);
  if (subInit.code !== 0) throw new Error(`sub-root init failed: ${subInit.stderr}`);
  tamperManagedBlock(join(repo.root, 'AGENTS.md'));
  tamperManagedBlock(join(subRootOf(repo), 'AGENTS.md'));
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('在子根运行 init --update', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, 'init', '--update'], {
    cwd: subRootOf(repo),
    encoding: 'utf8',
    env,
  });
  ctx.fixtures['子根update结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  } satisfies RunResult;
});

bdd.thenStep('根实例与子根实例的托管块均恢复为当前模板渲染且子根仍无 .agents/skills', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['子根update结果'] as RunResult;
  if (r.code !== 0) throw new Error(`sub-root --update failed: ${r.out}`);
  for (const p of [join(repo.root, 'AGENTS.md'), join(subRootOf(repo), 'AGENTS.md')]) {
    const s = readFileSync(p, 'utf8');
    if (s.includes('TAMPER-MARK')) throw new Error(`stale body survived in ${p}`);
    if (!s.includes('LLMANSPEC:START')) throw new Error(`managed block missing in ${p}`);
  }
  if (existsSync(join(subRootOf(repo), '.agents', 'skills'))) {
    throw new Error('sub-root --update must not inject skills');
  }
});

// ---------------------------------------------------------------------------
// r106 — 新建实例告警(祖先存在实例时 init 输出 WARNING)
// ---------------------------------------------------------------------------

bdd.given('一个根实例已初始化的 git 仓库', (ctx) => {
  const repo = makeTempRepo();
  const rootInit = repo.run('bun', [CLI, 'init']);
  if (rootInit.code !== 0) throw new Error(`root init failed: ${rootInit.stderr}`);
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('在其空子目录运行 init packages/tui', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  mkdirSync(subRootOf(repo), { recursive: true });
  const proc = repo.run('bun', [CLI, 'init', SUB]);
  ctx.fixtures['新建实例结果'] = {
    code: proc.code,
    out: `${proc.stdout}${proc.stderr}`,
  } satisfies RunResult;
});

bdd.thenStep('packages/tui 成为新实例且 stderr 含指向根实例位置的 WARNING', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['新建实例结果'] as RunResult;
  if (r.code !== 0) throw new Error(`sub-root init failed: ${r.out}`);
  if (!existsSync(join(subRootOf(repo), 'llmanspec', 'config.yaml'))) {
    throw new Error('packages/tui did not become a new instance');
  }
  if (!r.out.includes('WARNING')) throw new Error(`no new-instance WARNING:\n${r.out}`);
  if (!r.out.includes(repo.root)) {
    throw new Error(`WARNING lacks the existing instance path ${repo.root}:\n${r.out}`);
  }
});

bdd.given('一个无任何 llmanspec 实例的空目录', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-empty-ws-'));
  ctx.fixtures['空目录工作区'] = { root };
});

bdd.when('运行 init', (ctx) => {
  const { root } = ctx.fixtures['空目录工作区'] as { root: string };
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, 'init'], { cwd: root, encoding: 'utf8', env });
  ctx.fixtures['空目录init结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  } satisfies RunResult;
});

bdd.thenStep('stderr 无新建实例 WARNING 且实例正常创建', (ctx) => {
  const r = ctx.fixtures['空目录init结果'] as RunResult;
  if (r.code !== 0) throw new Error(`init failed: ${r.out}`);
  if (r.out.includes('WARNING')) throw new Error(`unexpected WARNING:\n${r.out}`);
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

// ---------------------------------------------------------------------------
// r109 — show 的 change 面在「无有效实例但含 changes」的工作区保持单根行为:
// 该宽容面由同条 r109 的单根逐字节一致 MUST 推出(前代 show 直接按缺省实例
// 目录读 change),仅显式 --directory 才 MUST 报域错误。list 无此豁免。
// ---------------------------------------------------------------------------

bdd.given('一个只有 changes 目录而无有效实例判据的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  // 有效性判据 = config.yaml 或 specs/ 目录;两者都去掉 → 目录不是有效实例根
  rmSync(join(repo.root, 'llmanspec', 'config.yaml'), { force: true });
  rmSync(join(repo.root, 'llmanspec', 'specs'), { recursive: true, force: true });
  mkdirSync(join(repo.root, 'llmanspec', 'changes', 'only'), { recursive: true });
  writeFileSync(
    join(repo.root, 'llmanspec', 'changes', 'only', 'proposal.md'),
    '---\ndepends_on: []\ntitle: 单根遗留条目\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
  );
  if (
    existsSync(join(repo.root, 'llmanspec', 'config.yaml')) ||
    existsSync(join(repo.root, 'llmanspec', 'specs'))
  ) {
    throw new Error('fixture 仍构成有效实例根');
  }
  ctx.fixtures['无实例含changes仓库'] = { repo };
});

bdd.when('在该仓库运行 show 该 change 并在同一目录以 --directory 显式限定', (ctx) => {
  const { repo } = ctx.fixtures['无实例含changes仓库'] as { repo: TempRepo };
  const picked = (args: string[]) => {
    const r = runCli(args, repo.root, process.env);
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };
  ctx.fixtures['无实例show结果'] = {
    plain: picked(['show', 'only', '--output', 'human']),
    scoped: picked(['show', 'only', '--directory', repo.root]),
    listed: picked(['list']),
  };
});

bdd.thenStep('缺省形态读出该 change 而显式 --directory 形态与 list 都报域错误', (ctx) => {
  const r = ctx.fixtures['无实例show结果'] as {
    plain: RunResult;
    scoped: RunResult;
    listed: RunResult;
  };
  if (r.plain.code !== 0) throw new Error(`缺省 show 未保持单根行为:\n${r.plain.out}`);
  if (!r.plain.out.includes('单根遗留条目')) {
    throw new Error(`缺省 show 未读出该 change:\n${r.plain.out}`);
  }
  for (const [name, ran] of [
    ['show --directory', r.scoped],
    ['list', r.listed],
  ] as const) {
    if (ran.code !== 1) throw new Error(`${name} 未按域错误退出(${ran.code}):\n${ran.out}`);
    if (!ran.out.includes('no llmanspec root at or above')) {
      throw new Error(`${name} 未报域错误:\n${ran.out}`);
    }
    if (ran.out.includes('ENOENT')) throw new Error(`${name} 泄漏了底层错误:\n${ran.out}`);
  }
});
