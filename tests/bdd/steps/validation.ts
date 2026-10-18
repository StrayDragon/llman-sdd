// Domain step definitions: validation 能力 — 覆盖 r11/r12(种子缺陷目录的
// 进程内校验聚合)、r47/r48(validate 旗标矩阵)、r32(INFO 级 issue 缺省
// 过滤)、r11/r13/r63/r64/r65(executable 化 HIGH 批:报告聚合、--check
// no-op、completeness/脏 specs WARNING、frontmatter 合法字段门、孤儿验收
// WARNING,全部走 CLI 子进程)。
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { discoverSpecs, validateAllSpecs, type DiscoveryIo } from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI, type TempRepo, makeTempRepo, runCli } from './shared.ts';

// ---------------------------------------------------------------------------
// validation capability — seeded-defect specs directory
// ---------------------------------------------------------------------------

interface SpecsDirFixture {
  io: DiscoveryIo;
  specsDir: string;
}

interface ValidateResult {
  failed: boolean;
  lines: string[];
}

bdd.given('一个含缺 @req 与重复 req_id 缺陷的 specs 目录', (ctx) => {
  const files: Record<string, string> = {
    'llmanspec/specs/noreq.feature': `# language: zh-CN\n# capability: noreq\n# purpose: p\n# scope: llmanspec/\n\n功能: noreq\n\n  规则: 缺句柄\n    系统 MUST x\n`,
    'llmanspec/specs/dupa.feature': `# language: zh-CN\n# capability: dupa\n# purpose: p\n# scope: llmanspec/\n\n功能: dupa\n\n  @req:r20\n  规则: ok\n    系统 MUST x\n`,
    'llmanspec/specs/dupb.feature': `# language: zh-CN\n# capability: dupb\n# purpose: p\n# scope: llmanspec/\n\n功能: dupb\n\n  @req:r20\n  规则: ok\n    系统 MUST x\n`,
  };
  const io: DiscoveryIo = {
    exists: (p) => p.startsWith('llmanspec/'),
    isDirectory: (p) => p === 'llmanspec/' || p === 'llmanspec/specs' || p === 'llmanspec/specs/',
    listDir: (p) => {
      const names = Object.keys(files).map((f) => f.slice('llmanspec/specs/'.length));
      return p === 'llmanspec/specs' || p === 'llmanspec/specs/' ? names : [];
    },
    readText: (p) => files[p] ?? '',
  };
  ctx.fixtures['缺陷目录'] = { io, specsDir: 'llmanspec/specs' };
});

bdd.when('运行 specs 校验', (ctx) => {
  const fixture = ctx.fixtures['缺陷目录'] as SpecsDirFixture | undefined;
  if (!fixture) throw new Error('no specs-dir fixture — did the 假如 step run?');
  const entries = discoverSpecs(fixture.specsDir, fixture.io);
  const report = validateAllSpecs(entries);
  ctx.fixtures['校验结果'] = { failed: report.failed, lines: report.lines };
});

bdd.thenStep('FAIL 集合恰为缺 @req 与重复 req_id 涉事的 capability', (ctx) => {
  const result = ctx.fixtures['校验结果'] as ValidateResult | undefined;
  const failCaps = (result?.lines ?? [])
    .filter((l) => l.startsWith('FAIL spec/'))
    .map((l) => l.slice('FAIL spec/'.length))
    .toSorted();
  const expected = ['dupa', 'dupb', 'noreq'].toSorted();
  if (JSON.stringify(failCaps) !== JSON.stringify(expected)) {
    throw new Error(
      `FAIL set must be exactly ${expected.join(', ')} (缺 @req + 重复 req_id 涉事 capability), got: ${failCaps.join(', ')}`,
    );
  }
});

// r12 — 同一文件内两条规则挂同一 @req 也判 ERROR(issue #4)
bdd.given('一个单 capability 文件内两条规则挂同一 @req 的 specs 目录', (ctx) => {
  const files: Record<string, string> = {
    'llmanspec/specs/dupsame.feature': `# language: zh-CN\n# capability: dupsame\n# purpose: p\n# scope: llmanspec/\n\n功能: dupsame\n\n  @req:r21\n  规则: 甲\n    系统 MUST x\n\n  @req:r21\n  规则: 乙\n    系统 MUST y\n`,
  };
  const io: DiscoveryIo = {
    exists: (p) => p.startsWith('llmanspec/'),
    isDirectory: (p) => p === 'llmanspec/' || p === 'llmanspec/specs' || p === 'llmanspec/specs/',
    listDir: (p) => {
      const names = Object.keys(files).map((f) => f.slice('llmanspec/specs/'.length));
      return p === 'llmanspec/specs' || p === 'llmanspec/specs/' ? names : [];
    },
    readText: (p) => files[p] ?? '',
  };
  ctx.fixtures['缺陷目录'] = { io, specsDir: 'llmanspec/specs' };
});

bdd.thenStep('FAIL 集合恰为该 capability', (ctx) => {
  const result = ctx.fixtures['校验结果'] as ValidateResult | undefined;
  const failCaps = (result?.lines ?? [])
    .filter((l) => l.startsWith('FAIL spec/'))
    .map((l) => l.slice('FAIL spec/'.length));
  if (JSON.stringify(failCaps) !== JSON.stringify(['dupsame'])) {
    throw new Error(
      `FAIL set must be exactly dupsame (同文件重复 req_id 涉事 capability), got: ${failCaps.join(', ')}`,
    );
  }
});

bdd.thenStep('退出码非零', (ctx) => {
  // CLI-subprocess runs report {code}; the in-process validation fixture
  // reports {failed} — the same Then serves both shapes.
  const cli = ctx.fixtures['validate结果'] as { code: number } | undefined;
  if (cli !== undefined) {
    if (cli.code === 0) throw new Error('expected a non-zero exit code');
    return;
  }
  const result = ctx.fixtures['校验结果'] as ValidateResult | undefined;
  if (!result?.failed) throw new Error('expected validation to fail');
});

// ---------------------------------------------------------------------------
// r47/r48 — validate flag matrix (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含 specs 与已绑定 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-val';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft']);
  ctx.fixtures['validate仓库'] = { root: repo.root, repo, id };
});

bdd.when('运行 validate --stage full 指向 draft 阶段 change', (ctx) => {
  const { root, repo, id } = ctx.fixtures['validate仓库'] as {
    root: string;
    repo: TempRepo;
    id: string;
  };
  // 审计:非 harness 测试对象,缺省(夹具无 bdd 配置,harness 不会执行)
  const result = repo.run('bun', [CLI, 'validate', id, '--stage', 'full']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('退出码非零且按产物报阶段强制缺失(前代语义)', (ctx) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`stage gate should fail: ${r.stdout}`);
  if (!`${r.stdout}${r.stderr}`.includes('Stage forced to')) {
    throw new Error(`stage gate message missing: ${r.stdout}${r.stderr}`);
  }
});

// r48/r13 — harness execution acceptance (marker-file assertions, no
// exit-code proxies). The check_command fixtures write deterministic marker
// files instead of running a real test suite.
const harnessSpec = (cap: string, req: string): string =>
  `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n\n  @req:${req}\n  规则: 规则\n    系统 MUST x\n`;

function harnessRepo(runCommand: string): TempRepo {
  const repo = makeTempRepo();
  // exactly two capabilities: drop the factory's sample spec
  rmSync(join(repo.root, 'llmanspec', 'specs', 'sample.feature'));
  writeFileSync(join(repo.root, 'llmanspec', 'specs', 'alpha.feature'), harnessSpec('alpha', 'r7'));
  writeFileSync(join(repo.root, 'llmanspec', 'specs', 'beta.feature'), harnessSpec('beta', 'r8'));
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    `schema: spec-driven\nspecs:\n  check_command: '${runCommand}'\n`,
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'harness fixture']);
  return repo;
}

bdd.given('一个含两个 capability 且 check_command 按 feature_name 写标记文件的临时仓库', (ctx) => {
  const repo = harnessRepo('echo {feature_name} >> .harness.log');
  ctx.fixtures['validate仓库'] = { repo, id: 'alpha' } satisfies ValidateRepoFixture;
});

bdd.given('一个含两个 capability 且 check_command 无占位符并写标记文件的临时仓库', (ctx) => {
  const repo = harnessRepo('echo run >> .harness.log');
  ctx.fixtures['validate仓库'] = { repo, id: 'alpha' } satisfies ValidateRepoFixture;
});

bdd.given('一个含两个 capability 且 check_command 以退出码 3 失败的临时仓库', (ctx) => {
  const repo = harnessRepo('exit 3');
  ctx.fixtures['validate仓库'] = { repo, id: 'alpha' } satisfies ValidateRepoFixture;
});

// harness-objective call: 观察缺省(--check/--json 变体见下)
bdd.when('运行 validate --specs', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

// 审计:harness 测试对象(本场景观察显式 --check 执行/缓存/守卫本身)
bdd.when('运行 validate --specs --check', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--check']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

// 结构门(缺省不跑 harness):种子缺陷逐类判定等结构场景使用
bdd.when('运行 validate --specs --json', (ctx) => {
  const five = ctx.fixtures['transitions四类仓库'] as { repo: TempRepo } | undefined;
  const { repo } = five ?? (ctx.fixtures['validate仓库'] as { repo: TempRepo });
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--json']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

// 审计:harness 测试对象(本场景观察执行/缓存/守卫本身),缺省不执行 harness
bdd.when('运行 validate --specs --check --json', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--check', '--json']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

// 审计:harness 测试对象(本场景观察嵌套守卫),刻意显式 --check 以触达守卫
bdd.when(
  '在设置 LLMAN_SDD_HARNESS_ACTIVE=1 的环境下运行 validate --specs --check --json --include-info',
  (ctx) => {
    const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
    const proc = runCli(['validate', '--specs', '--check', '--json', '--include-info'], repo.root, {
      ...process.env,
      LLMAN_SDD_HARNESS_ACTIVE: '1',
    });
    ctx.fixtures['validate结果'] = {
      code: proc.status ?? 1,
      stdout: proc.stdout ?? '',
      stderr: proc.stderr ?? '',
    };
    ctx.fixtures['命令结果'] = {
      code: proc.status ?? 1,
      stdout: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    };
  },
);

// 审计:harness 测试对象(本场景观察执行/缓存/守卫本身),缺省不执行 harness
bdd.when('运行 validate --specs --check --json --include-info', (ctx) => {
  const { repo } = ctx.fixtures['验证仓库'] as ValidateRepoFixture;
  const result = repo.run('bun', [
    CLI,
    'validate',
    '--specs',
    '--check',
    '--json',
    '--include-info',
  ]);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

// 审计:harness 测试对象(本场景观察执行/缓存/守卫本身),缺省不执行 harness
bdd.when('运行 review 与 show 任一 capability', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  // review embeds a validate sweep; show runs the validate gate — neither may
  // execute the harness (r13): the marker file proves neither did.
  const review = repo.run('bun', [CLI, 'review', '--json']);
  const show = repo.run('bun', [CLI, 'show', 'alpha', '--type', 'spec', '--output', 'json']);
  ctx.fixtures['validate结果'] = {
    code: review.code === 0 ? show.code : review.code,
    stdout: `${review.stdout}${show.stdout}`,
    stderr: `${review.stderr}${show.stderr}`,
  };
  ctx.fixtures['命令结果'] = {
    code: review.code === 0 ? show.code : review.code,
    stdout: `${review.stdout}${show.stdout}`,
  };
});

const markerLines = (ctx: { fixtures: Record<string, unknown> }): string[] => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  return readFileSync(join(repo.root, '.harness.log'), 'utf8').trim().split('\n').toSorted();
};

bdd.thenStep('标记文件行集合等于全部 capability id', (ctx) => {
  const lines = markerLines(ctx);
  const expected = ['alpha', 'beta'];
  if (JSON.stringify(lines) !== JSON.stringify(expected)) {
    throw new Error(
      `marker lines must equal ${JSON.stringify(expected)}, got ${JSON.stringify(lines)}`,
    );
  }
});

bdd.thenStep('标记文件恰有 1 行', (ctx) => {
  const lines = markerLines(ctx);
  if (lines.length !== 1 || lines[0] === '') {
    throw new Error(`marker file must hold exactly one line, got: ${JSON.stringify(lines)}`);
  }
});

bdd.thenStep('标记文件不存在', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  if (existsSync(join(repo.root, '.harness.log'))) {
    throw new Error('marker file must not exist when the harness did not run');
  }
});

bdd.thenStep('每个 spec 条目 valid 为 false 且含 "{text}" 的 ERROR', (ctx, text: string) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  const parsed = JSON.parse(r.stdout) as {
    items: { id: string; valid: boolean; issues: { level: string; message: string }[] }[];
  };
  if (parsed.items.length === 0) throw new Error(`no spec items in: ${r.stdout}`);
  for (const item of parsed.items) {
    if (item.valid) throw new Error(`spec ${item.id} must be invalid: ${r.stdout}`);
    const hit = item.issues.find((x) => x.level === 'ERROR' && x.message.includes(text));
    if (hit === undefined) {
      throw new Error(
        `spec ${item.id} lacks ERROR containing "${text}": ${JSON.stringify(item.issues)}`,
      );
    }
  }
});

bdd.thenStep('输出含 "{text}" 的 INFO', (ctx, text: string) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  const parsed = JSON.parse(r.stdout) as {
    items: { issues: { level: string; message: string }[] }[];
  };
  const hit = parsed.items
    .flatMap((i) => i.issues)
    .find((x) => x.level === 'INFO' && x.message.includes(text));
  if (hit === undefined) {
    throw new Error(`no INFO issue containing "${text}" in: ${r.stdout}`);
  }
});

bdd.thenStep('help 文案说明缺省跳过 harness 且 --check 显式执行', (ctx) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes('run the spec check') || !out.includes('default skips')) {
    throw new Error(`help text must state opt-in --check + default skip:\n${out}`);
  }
});

// r32 — INFO-level issue default filtering (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含 pending 规则的有效 spec 工作区', (ctx) => {
  const repo = makeTempRepo();
  mkdirSync(join(repo.root, 'llmanspec', 'specs'), { recursive: true });
  // 裸规则(无嵌套场景)→ 稳定产生一条 INFO 级 pending 提示,spec 仍 valid
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'auth.feature'),
    '# language: zh-CN\n# capability: auth\n# purpose: p\n# scope: llmanspec/\n\n功能: auth\n\n  @req:r2\n  规则: 规则\n    系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  ctx.fixtures['info仓库'] = repo;
});

bdd.when('运行 validate --all --json 与 validate --all --json --include-info', (ctx) => {
  const repo = ctx.fixtures['info仓库'] as TempRepo;
  // 审计:非 harness 测试对象,两次调用均缺省(夹具无 bdd 配置,harness 不会执行)
  const def = repo.run('bun', [CLI, 'validate', '--all', '--json']);
  const full = repo.run('bun', [CLI, 'validate', '--all', '--json', '--include-info']);
  ctx.fixtures['info两态'] = {
    def: { code: def.code, stdout: def.stdout },
    full: { code: full.code, stdout: full.stdout },
  };
});

interface InfoValidateRun {
  code: number;
  stdout: string;
}

bdd.thenStep('缺省输出不含 INFO 级 issue 且 include-info 输出含 INFO 级 issue', (ctx) => {
  const { def, full } = ctx.fixtures['info两态'] as {
    def: InfoValidateRun;
    full: InfoValidateRun;
  };
  const parse = (r: InfoValidateRun): { level: string; id: string }[] => {
    const d = JSON.parse(r.stdout) as {
      items: { id: string; issues: { level: string }[] }[];
    };
    return d.items.flatMap((i) => i.issues.map((issue) => ({ level: issue.level, id: i.id })));
  };
  const defIssues = parse(def);
  const fullIssues = parse(full);
  if (defIssues.some((i) => i.level === 'INFO')) {
    throw new Error(`default output must drop INFO issues: ${def.stdout}`);
  }
  if (!fullIssues.some((i) => i.level === 'INFO')) {
    throw new Error(`--include-info must keep INFO issues: ${full.stdout}`);
  }
});

bdd.thenStep('两次运行的 valid 判定与退出码一致', (ctx) => {
  const { def, full } = ctx.fixtures['info两态'] as {
    def: InfoValidateRun;
    full: InfoValidateRun;
  };
  const validOf = (r: InfoValidateRun): unknown =>
    (JSON.parse(r.stdout) as { items: { id: string; valid: boolean }[] }).items.map((i) => [
      i.id,
      i.valid,
    ]);
  if (JSON.stringify(validOf(def)) !== JSON.stringify(validOf(full))) {
    throw new Error('valid verdicts diverged between default and --include-info runs');
  }
  if (def.code !== full.code) {
    throw new Error(`exit codes diverged: ${def.code} vs ${full.code}`);
  }
});

// r11/r13/r63/r64/r65 — validation executable 化 HIGH 批 (acceptance).
// 全部走 CLI 子进程;When 步骤把 {code, stdout: stdout+stderr} 写入
// fixtures['命令结果'] 以复用 smoke 的「退出码为/stdout 符合正则」断言
// (human 模式的 FAIL/issue 行走 stderr,故合并捕获)。
// ---------------------------------------------------------------------------

interface ValidateRepoFixture {
  repo: TempRepo;
  id: string;
}

const gitCommit = ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm'];

/** Combined-output CLI run against a temp repo. */
function runCliCombined(repo: TempRepo, args: string[]): { code: number; stdout: string } {
  const r = repo.run('bun', [CLI, ...args]);
  return { code: r.code, stdout: `${r.stdout}${r.stderr}` };
}

const requireValidateRepo = (ctx: { fixtures: Record<string, unknown> }): ValidateRepoFixture => {
  const fixture = ctx.fixtures['验证仓库'] as ValidateRepoFixture | undefined;
  if (!fixture) throw new Error('no temp repo fixture — did the 假如 step run?');
  return fixture;
};

// r11 — seeded-defect report aggregation: FAIL/OK lines + Totals + exit code.
bdd.given('一个含种子缺陷 spec 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'broken.feature'),
    '# language: zh-CN\n# capability: broken\n# purpose: p\n# scope: llmanspec/\n\n功能: broken\n\n  规则: 缺句柄\n    系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'seed defect']);
  ctx.fixtures['验证仓库'] = { repo, id: 'broken' } satisfies ValidateRepoFixture;
});

bdd.when('在该仓库运行 validate --specs --output human', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  // 审计:非 harness 测试对象,缺省(夹具无 bdd 配置)
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', '--specs', '--output', 'human']);
});

// r13 — 未配置 check_command 的仓库:--check 只产出 INFO 提示(default 配置无 bdd 段)
bdd.given('一个含有效 specs 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  ctx.fixtures['验证仓库'] = { repo, id: 'sample' } satisfies ValidateRepoFixture;
});

bdd.when('运行 validate --help', (ctx) => {
  const fixture =
    (ctx.fixtures['验证仓库'] as ValidateRepoFixture | undefined) ??
    (ctx.fixtures['validate仓库'] as ValidateRepoFixture | undefined);
  if (fixture === undefined) throw new Error('no temp repo fixture — did the 假如 step run?');
  ctx.fixtures['命令结果'] = runCliCombined(fixture.repo, ['validate', '--help']);
});

// r63 — completeness WARNING (full-not-landed, skill guidance) + workspace-level
// dirty live specs WARNING on the default branch. JSON mode is the observation
// seam: single-item human output stays silent for valid items, so the WARNING
// surface is read from items[].issues.
bdd.given('一个 stage=full 已绑定但 specs 未 landed 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-landed';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'design.md'), '# design\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [x] done\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('对该 change 运行 validate --json', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--json']);
});

// 审计:同上(change 域单目标,--strict 只升级 WARNING)
bdd.when('对该 change 运行 validate --json --strict', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--json', '--strict']);
});

bdd.thenStep('specs not landed 条目级别为 ERROR 且退出码非零', (ctx) => {
  const r = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  if (r.code === 0) throw new Error(`--strict run must exit non-zero: ${r.stdout}`);
  const hit = requireIssues(ctx).find((x) => x.message.includes('specs not landed'));
  if (hit === undefined) throw new Error(`specs not landed entry missing: ${r.stdout}`);
  if (hit.level !== 'ERROR') {
    throw new Error(`--strict must escalate the entry to ERROR, got ${hit.level}`);
  }
});

const requireIssues = (ctx: {
  fixtures: Record<string, unknown>;
}): { level: string; path: string; message: string }[] => {
  const r = ctx.fixtures['命令结果'] as { stdout: string };
  // runCliCombined concatenates stdout+stderr; the CLI prints a trailing
  // `Error: validation failed` on stderr for failing runs. Prefer parsing the
  // JSON head when the tail carries that human trailer.
  let text = r.stdout;
  const trimmed = text.replace(/\nError: validation failed\s*$/u, '');
  if (trimmed.trim() !== '') text = trimmed;
  const parsed = JSON.parse(text) as {
    items: { issues: { level: string; path: string; message: string }[] }[];
  };
  return parsed.items.flatMap((i) => i.issues);
};

bdd.thenStep('输出含 specs not landed WARNING 且带 llman-sdd-propose 引导', (ctx) => {
  const hit = requireIssues(ctx).find((x) => x.message.includes('specs not landed'));
  if (!hit) {
    throw new Error(`specs-not-landed WARNING missing:\n${JSON.stringify(requireIssues(ctx))}`);
  }
  if (hit.level !== 'WARNING') throw new Error(`expected WARNING, got ${hit.level}`);
  if (!hit.message.includes('llman-sdd-propose')) {
    throw new Error(`propose skill guidance missing:\n${hit.message}`);
  }
});

bdd.thenStep('不建议重跑 change start', (ctx) => {
  const hit = requireIssues(ctx).find((x) => x.message.includes('specs not landed'));
  if (!hit?.message.includes('do NOT re-run change start')) {
    throw new Error(`anti-guidance against re-running change start missing:\n${hit?.message}`);
  }
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('切回默认分支并弄脏 llmanspec/specs 后再次运行 validate', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  repo.run('git', ['switch', 'main']);
  const specPath = join(repo.root, 'llmanspec', 'specs', 'sample.feature');
  writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n# dirty edit\n`);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

bdd.thenStep('输出含工作区级脏 specs WARNING', (ctx) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes('live specs dirty on default branch')) {
    throw new Error(`workspace-level dirty-specs WARNING missing:\n${out}`);
  }
});

// r64 — proposal frontmatter legal-field gate.
bdd.given('一个 proposal frontmatter 含未知字段 "{field}" 的临时仓库', (ctx, field) => {
  const repo = makeTempRepo();
  const id = 'demo-fm';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'proposal.md'),
    `---\ndepends_on: []\n${field}: draft\n---\n\n## Why\nx\n`,
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('对该 change 运行 validate --output human', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

bdd.thenStep('输出含未知字段 "{field}" 与合法字段集提示', (ctx, field) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes(`unknown field '${field}'`)) {
    throw new Error(`unknown-field message for '${field}' missing:\n${out}`);
  }
  if (
    !out.includes('depends_on, blocks, branch, base_branch, base_sha, needs_specs_change, title')
  ) {
    throw new Error(`allowed-field set missing from message:\n${out}`);
  }
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('把 frontmatter 改写为七个合法字段后再次运行 validate', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  writeFileSync(
    join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'),
    '---\ndepends_on: []\nblocks: []\ntitle: demo\nbranch: sdd/demo-fm\nbase_branch: main\nbase_sha: abc\nneeds_specs_change: false\n---\n\n## Why\nx\n',
  );
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

// r99 — proposal title 必填门 (acceptance):缺字段/空串 → ERROR;change new
// 骨架自带非空占位直接过门。夹具与 r64 同构(验证仓库 + id)。
bdd.given('一个活跃 change 的 proposal frontmatter 无 title 字段的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-title';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.given('一个活跃 change 的 proposal frontmatter 为 title: 空串的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-empty-title';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\ntitle: ""\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.given('一个经 change new 刚生成骨架的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-skel';
  repo.run('bun', [CLI, 'change', 'new', id]);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('对该 change 运行 validate', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id]);
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('对该骨架 change 运行 validate', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id]);
});

bdd.thenStep('输出含缺 title 的 ERROR 且退出码非零', (ctx) => {
  const { code, stdout } = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  if (code === 0) throw new Error(`validate must fail on missing title:\n${stdout}`);
  if (!stdout.includes("requires a non-empty 'title'")) {
    throw new Error(`title gate message missing:\n${stdout}`);
  }
});

bdd.thenStep('输出含 title 为空的 ERROR', (ctx) => {
  const { stdout } = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  if (!stdout.includes("requires a non-empty 'title'")) {
    throw new Error(`title gate message missing:\n${stdout}`);
  }
});

bdd.thenStep('骨架自带的非空 title 占位通过本门（无 title 相关 ERROR）', (ctx) => {
  const { stdout } = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  if (stdout.includes("requires a non-empty 'title'")) {
    throw new Error(`skeleton must carry a non-empty title placeholder:\n${stdout}`);
  }
});

// r63 — apply 入门以 specs-landed 门表述(不再以 readyToImplement 作为入门条件)
bdd.thenStep('引导以 specs-landed 门为 apply 入门且不含 "{text}"', (ctx, text) => {
  const hit = requireIssues(ctx).find((x) => x.message.includes('specs not landed'));
  if (!hit?.message.includes('specs-landed gate')) {
    throw new Error(`specs-landed gate guidance missing:\n${hit?.message}`);
  }
  if (hit.message.includes(text)) {
    throw new Error(`guidance must not contain "${text}":\n${hit.message}`);
  }
});

// r74 — 四条失败路径的输出卫生:无内部需求编号,git 门文案族稳定子串
bdd.when(
  '依次触发非法 change_id.pattern、不存在的 attach --base、detached HEAD 与非绑定分支 finalize 四条失败路径',
  (ctx) => {
    const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
    const id = (ctx.fixtures['change'] as { id: string }).id;
    const outputs: string[] = [];

    // 1. non-matching change_id.pattern → validate ERROR
    const configPath = join(repo.root, 'llmanspec', 'config.yaml');
    writeFileSync(configPath, "schema: spec-driven\nchange_id:\n  pattern: '^zzz$'\n");
    const v = repo.run('bun', [CLI, 'validate', id, '--json']);
    outputs.push(`${v.stdout}${v.stderr}`);
    writeFileSync(configPath, 'schema: spec-driven\n');

    // 2. attach --base pointing at a missing branch
    const a = repo.run('bun', [CLI, 'change', 'attach', id, '--force', '--base', 'no-such-branch']);
    outputs.push(`${a.stdout}${a.stderr}`);

    // 3. detached HEAD → attach refuses
    repo.run('git', ['checkout', '-q', '--detach']);
    const d = repo.run('bun', [CLI, 'change', 'attach', id, '--force']);
    outputs.push(`${d.stdout}${d.stderr}`);

    // 4. finalize on a non-bound branch
    repo.run('git', ['switch', '-qC', 'other-branch']);
    const f = repo.run('bun', [CLI, 'change', 'finalize', id]);
    outputs.push(`${f.stdout}${f.stderr}`);

    ctx.fixtures['四路径输出'] = outputs;
  },
);

bdd.thenStep('四次输出均不含内部需求编号', (ctx) => {
  const outputs = ctx.fixtures['四路径输出'] as string[];
  if (outputs.length !== 4) throw new Error(`expected 4 outputs, got ${outputs.length}`);
  for (const [i, out] of outputs.entries()) {
    if (
      /\((?:[a-z-]+ )?r\d+[^)]*\)/u.test(out) ||
      /\b(?:sdd-workflow|spec-format|predecessor) r\d+\b/u.test(out)
    ) {
      throw new Error(`output ${i + 1} leaks internal requirement ids:\n${out}`);
    }
  }
});

bdd.thenStep(
  'detached HEAD 与非绑定分支的报错分别含 "{a}" 与 "{b}"',
  (ctx, a: string, b: string) => {
    const outputs = ctx.fixtures['四路径输出'] as string[];
    const detached = outputs[2] ?? '';
    const wrongBranch = outputs[3] ?? '';
    if (!detached.includes(a)) {
      throw new Error(`detached-HEAD output must contain "${a}":\n${detached}`);
    }
    if (!wrongBranch.includes(b)) {
      throw new Error(`non-bound-branch output must contain "${b}":\n${wrongBranch}`);
    }
  },
);

// r73 — dependency reference resolution + body-text immunity for
// needs_specs_change (acceptance). Archive dirs, frozen cards and both dep
// consumers are seeded in one repo; the When targets the change seeded for
// the named dep.
bdd.given('一个含归档目录 "{entry}" 与平铺冻结卡 "{card}" 的临时仓库', (ctx, entry, card) => {
  const repo = makeTempRepo();
  const writeProposal = (id: string, frontmatter: string): void => {
    const dir = join(repo.root, 'llmanspec', 'changes', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'proposal.md'), frontmatter);
  };
  writeProposal(`archive/${entry}`, '---\ndepends_on: []\n---\nx\n');
  // 平铺冻结卡:目录内 proposal.md 已随 freeze 入冷备,磁盘仅存 <date>-<id>.yaml
  writeFileSync(
    join(repo.root, 'llmanspec', 'changes', 'archive', card),
    '---\ndepends_on: []\n---\n',
  );
  writeProposal('demo-ghost', '---\ndepends_on: [ghost]\n---\n\n## Why\nx\n');
  writeProposal('demo-arch', '---\ndepends_on: [other]\n---\n\n## Why\nx\n');
  writeProposal('demo-flat', '---\ndepends_on: [flat]\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'seed deps']);
  ctx.fixtures['依赖仓库'] = {
    repo,
    changes: { ghost: 'demo-ghost', other: 'demo-arch', flat: 'demo-flat' },
  };
});

bdd.when('对 depends_on 为 "{dep}" 的 change 运行 validate --json', (ctx, dep) => {
  const { repo, changes } = ctx.fixtures['依赖仓库'] as {
    repo: TempRepo;
    changes: Record<string, string>;
  };
  const id = changes[dep];
  if (id === undefined) throw new Error(`no seeded change for dep '${dep}'`);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
  // 审计:change 域单目标,harness 不触发;夹具亦无 bdd 配置
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--json']);
});

bdd.thenStep('输出含 "references unknown change: {dep}" 的 ERROR', (ctx, dep) => {
  const hit = requireIssues(ctx).find(
    (x) => x.level === 'ERROR' && x.message.includes(`references unknown change: ${dep}`),
  );
  if (!hit) {
    throw new Error(
      `unknown-change ERROR for '${dep}' missing:\n${JSON.stringify(requireIssues(ctx))}`,
    );
  }
});

bdd.thenStep('该 change 无依赖相关 issue', (ctx) => {
  const depIssues = requireIssues(ctx).filter(
    (x) =>
      x.message.includes('references unknown change') ||
      x.path.startsWith('proposal.md/frontmatter.depends_on') ||
      x.path.startsWith('proposal.md/frontmatter.blocks'),
  );
  if (depIssues.length > 0) {
    throw new Error(
      `dependency issues reported for an archived dep:\n${JSON.stringify(depIssues)}`,
    );
  }
});

bdd.given('一个 stage=full 已绑定但 specs 未 landed 且正文含 "{text}" 的临时仓库', (ctx, text) => {
  const repo = makeTempRepo();
  const id = 'demo-landed';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  // body text mirroring the frontmatter key must not flip needs_specs_change
  writeFileSync(join(dir, 'proposal.md'), `---\ndepends_on: []\n---\n\n## Why\nx\n\n${text}\n`);
  writeFileSync(join(dir, 'design.md'), '# design\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [x] done\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

// ---------------------------------------------------------------------------
// T11 — validation 验收补强:r12(逐类判定/逐 capability FAIL 集合)、r47
// (输出模式与 strict 升级、--type 消歧)、r64(归档免检)、r65(悬空 req 链接)。
// 全部走 CLI 子进程,夹具无 bdd 配置 → 缺省(harness 不会执行)。
// ---------------------------------------------------------------------------

// r12 — per-defect verdicts (native v2): each defect type owns a capability.
// 保留缺陷:nocheader(缺头注释)、noreq(规则块缺 @req)、dupca/dupcb(重复
// req_id)、norule(零规则);WARNING 面:noscope(缺 scope 路径)、orphan
// (顶层孤儿场景)。已删除门(@human/@executable 互斥、@manual、缺 MUST 词、
// automatable guard @rule、dangling @req)不再出现在夹具中。
const mixedDefectSpecs: Record<string, string> = {
  'noheader.feature':
    '# language: zh-CN\n功能: noheader\n\n  @req:r101\n  规则: ok\n    系统 MUST x\n',
  'noreq.feature':
    '# language: zh-CN\n# capability: noreq\n# purpose: p\n# scope: llmanspec/\n\n功能: noreq\n\n  规则: ok\n    系统 MUST x\n',
  'dupca.feature':
    '# language: zh-CN\n# capability: dupca\n# purpose: p\n# scope: llmanspec/\n\n功能: dupca\n\n  @req:r106\n  规则: ok\n    系统 MUST x\n',
  'dupcb.feature':
    '# language: zh-CN\n# capability: dupcb\n# purpose: p\n# scope: llmanspec/\n\n功能: dupcb\n\n  @req:r106\n  规则: ok\n    系统 MUST x\n',
  'noscope.feature':
    '# language: zh-CN\n# capability: noscope\n# purpose: p\n# scope: packages/core/src/does-not-exist-xyz/\n\n功能: noscope\n\n  @req:r107\n  规则: ok\n    系统 MUST x\n',
  'orphan.feature':
    '# language: zh-CN\n# capability: orphan\n# purpose: p\n# scope: llmanspec/\n\n功能: orphan\n\n  场景: 孤儿场景\n    假如 前置\n    当 动作\n    那么 结果\n\n  @req:r108\n  规则: ok\n    系统 MUST x\n',
  'norule.feature':
    '# language: zh-CN\n# capability: norule\n# purpose: p\n# scope: llmanspec/\n\n功能: norule\n\n  场景: acc\n    假如 一个有效工作区\n    当 运行校验\n    那么 退出码为 0\n',
  'badtitle.feature':
    '# language: zh-CN\n# purpose: p\n\n功能: wrong-title\n\n  @req:r109\n  规则: ok\n    系统 MUST x\n',
};

bdd.given('一个每类种子缺陷各占一个 capability 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  for (const [name, content] of Object.entries(mixedDefectSpecs)) {
    writeFileSync(join(repo.root, 'llmanspec', 'specs', name), content);
  }
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'mixed defect fixture']);
  ctx.fixtures['validate仓库'] = { repo, id: 'noscope' } satisfies ValidateRepoFixture;
});

// 逐类判定 Then 的观察 seam:--json 的 items[].{id,valid,issues[]}。
interface DefectJsonItem {
  id: string;
  valid: boolean;
  issues: { level: string; path?: string; message: string }[];
}

const requireDefectItems = (ctx: { fixtures: Record<string, unknown> }): DefectJsonItem[] => {
  // Bulk `--json` runs are JSON on stdout; 'Error: validation failed' lands on
  // stderr, so parse the pure stdout, never the combined capture.
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string };
  const parsed = JSON.parse(r.stdout) as { items?: DefectJsonItem[] };
  return parsed.items ?? [];
};

bdd.thenStep(
  '缺 purpose 头、功能标题与 spec id 不一致、缺 @req、重复 req_id 与零规则 capability 各 capability 均 valid 为 false 且各含对应 ERROR',
  (ctx) => {
    const byId = new Map(requireDefectItems(ctx).map((i) => [i.id, i]));
    const checks: [string, string][] = [
      ['noheader', '`# purpose:` header comment must not be empty'],
      ['badtitle', 'Feature title must match assigned spec id'],
      ['noreq', 'rule must carry an @req'],
      ['dupca', 'global duplicate req_id'],
      ['dupcb', 'global duplicate req_id'],
      ['norule', 'spec must define at least one rule'],
    ];
    for (const [cap, marker] of checks) {
      const item = byId.get(cap);
      if (!item) throw new Error(`defect capability '${cap}' not in items`);
      if (item.valid === true) throw new Error(`'${cap}' must be invalid`);
      if (!item.issues.some((x) => x.level === 'ERROR' && x.message.includes(marker))) {
        throw new Error(
          `'${cap}' must carry the '${marker}' ERROR:\n${JSON.stringify(item.issues)}`,
        );
      }
    }
  },
);

bdd.thenStep('仅缺 scope 路径的 capability 含 WARNING 且 valid 为 true', (ctx) => {
  const byId = new Map(requireDefectItems(ctx).map((i) => [i.id, i]));
  const noscope = byId.get('noscope');
  if (!noscope) throw new Error('noscope capability missing from items');
  if (noscope.valid !== true) throw new Error('noscope must stay valid without --strict');
  if (
    !noscope.issues.some(
      (x) => x.level === 'WARNING' && x.message.includes('valid_scope path(s) do not exist'),
    )
  ) {
    throw new Error(`missing-scope WARNING expected:\n${JSON.stringify(noscope.issues)}`);
  }
  // 顶层功能级示例(无规则句柄)不再产生孤儿 WARNING —— 保持 valid 且无告警。
  const orphan = byId.get('orphan');
  if (!orphan) throw new Error('orphan capability missing from items');
  if (orphan.valid !== true) throw new Error('orphan must stay valid without --strict');
  if (orphan.issues.some((x) => x.level === 'WARNING' && x.message.includes('orphan scenario'))) {
    throw new Error(`unexpected orphan WARNING:\n${JSON.stringify(orphan.issues)}`);
  }
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('运行 validate --specs --json --strict', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--json', '--strict']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

bdd.thenStep('仅缺 scope 路径的 capability valid 为 false', (ctx) => {
  const byId = new Map(requireDefectItems(ctx).map((i) => [i.id, i]));
  const noscope = byId.get('noscope');
  if (!noscope) throw new Error('noscope capability missing from items');
  if (noscope.valid !== false) {
    throw new Error(`noscope must be invalid under --strict:\n${JSON.stringify(noscope.issues)}`);
  }
  // 顶层功能级示例无告警:--strict 下也保持 valid(不产生孤儿 WARNING)
  const orphan = byId.get('orphan');
  if (orphan !== undefined && orphan.valid !== true) {
    throw new Error(`orphan must stay valid under --strict:\n${JSON.stringify(orphan.issues)}`);
  }
});

// r47 — 输出模式分流(TOON 缺省 / human Totals / json 结构)
bdd.given('一个全部 specs 结构合格的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'noscope.feature'),
    '# language: zh-CN\n# capability: noscope\n# purpose: p\n# scope: packages/core/src/does-not-exist-xyz/\n\n功能: noscope\n\n  @req:r107\n  规则: ok\n    系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'scope-warning fixture']);
  ctx.fixtures['validate仓库'] = { repo, id: 'noscope' } satisfies ValidateRepoFixture;
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('运行 validate --specs --output human', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--strict', '--output', 'human']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('运行 validate --specs --output json', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--strict', '--output', 'json']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  ctx.fixtures['命令结果'] = { code: result.code, stdout: `${result.stdout}${result.stderr}` };
});

bdd.thenStep('stdout 为 TOON 且退出码为 0', (ctx) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`default output must exit 0:\n${r.stdout}`);
  if (!r.stdout.trimStart().startsWith('items[')) {
    throw new Error(`default output must be TOON (starts with items[):\n${r.stdout}`);
  }
  if (r.stdout.includes('Next steps')) {
    throw new Error('Next steps guidance must not appear in TOON output');
  }
});

bdd.thenStep('stdout 含 Totals 收尾且不含 "Next steps"', (ctx) => {
  const r = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`human green run must exit 0:\n${r.stdout}`);
  if (!r.stdout.includes('Totals: ')) {
    throw new Error(`human mode must end with Totals line:\n${r.stdout}`);
  }
  if (r.stdout.includes('Next steps')) {
    throw new Error('Next steps guidance must not appear for green runs');
  }
});

bdd.thenStep('stdout 为含 items、summary 与 version 的 JSON 且不含 "Next steps"', (ctx) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`green json run must exit 0:\n${r.stdout}`);
  const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
  for (const key of ['items', 'summary', 'version'] as const) {
    if (!(key in parsed)) throw new Error(`json output must carry '${key}':\n${r.stdout}`);
  }
  if (r.stdout.includes('Next steps')) {
    throw new Error('Next steps guidance must not appear in JSON output');
  }
});

// r47 — 同名 spec 与 change 以 --type 消歧
bdd.given('一个同时存在名为 "dual" 的 spec 与 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'dual.feature'),
    '# language: zh-CN\n# capability: dual\n# purpose: p\n# scope: llmanspec/\n\n功能: dual\n\n  @req:r200\n  规则: 规则\n    系统 MUST x\n',
  );
  const dir = join(repo.root, 'llmanspec', 'changes', 'dual');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'dual fixture']);
  ctx.fixtures['验证仓库'] = { repo, id: 'dual' } satisfies ValidateRepoFixture;
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('运行 validate dual --type change --json', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, [
    'validate',
    'dual',
    '--type',
    'change',
    '--json',
  ]);
});

bdd.when('运行 validate dual --type spec --json', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', 'dual', '--type', 'spec', '--json']);
});

bdd.thenStep('items 仅含 type 为 {type} 的条目', (ctx, type: string) => {
  const r = ctx.fixtures['命令结果'] as { stdout: string };
  const parsed = JSON.parse(r.stdout) as { items?: { type: string }[] };
  const items = parsed.items ?? [];
  if (items.length === 0) throw new Error(`expected at least one item of type '${type}'`);
  for (const it of items) {
    if (it.type !== type) {
      throw new Error(`item type must be '${type}', got '${it.type}':\n${r.stdout}`);
    }
  }
});

// r64 — changes/archive 下 proposal 免检(未知字段不报 issue)
bdd.given('一个 changes/archive 下 proposal 含未知字段 "status" 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const dir = join(repo.root, 'llmanspec', 'changes', 'archive', '2026-01-01-arch');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'proposal.md'),
    '---\ndepends_on: []\nstatus: shipped\n---\n\n## Why\nx\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'archived proposal']);
  ctx.fixtures['验证仓库'] = { repo, id: '2026-01-01-arch' } satisfies ValidateRepoFixture;
});

// 审计:非 harness 测试对象;夹具无 bdd 配置,validate 不会执行任何命令
bdd.when('运行 validate --changes --json', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', '--changes', '--json']);
});

bdd.thenStep('输出不含 unknown field 相关 issue', (ctx) => {
  const hits = requireIssues(ctx).filter((x) => x.message.includes('unknown field'));
  if (hits.length > 0) {
    throw new Error(
      `archived proposal must be exempt from the frontmatter field gate:\n${JSON.stringify(hits)}`,
    );
  }
});

// r87 — global change-id uniqueness gate (acceptance). Active change id
// colliding with an archived dir / frozen card id must surface as ERROR.
bdd.given('一个含活跃 change "{id}" 与归档目录 "{entry}" 的临时仓库', (ctx, id, entry) => {
  const repo = makeTempRepo();
  const mk = (rel: string, frontmatter: string): void => {
    const dir = join(repo.root, 'llmanspec', 'changes', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'proposal.md'), frontmatter);
  };
  mk(id, '---\ndepends_on: []\n---\n\n## Why\nx\n');
  mk(`archive/${entry}`, '---\ndepends_on: []\n---\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'seed duplicate']);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.given('一个仅含活跃 change "{id}" 的临时仓库', (ctx, id) => {
  const repo = makeTempRepo();
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'seed unique']);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.thenStep('输出含 "duplicate change id: {id}" 的 ERROR', (ctx, id) => {
  const hit = requireIssues(ctx).find(
    (x) => x.level === 'ERROR' && x.message.includes(`duplicate change id: ${id}`),
  );
  if (!hit) {
    throw new Error(`duplicate-change-id ERROR missing:\n${JSON.stringify(requireIssues(ctx))}`);
  }
});

bdd.thenStep('输出不含 "duplicate change id"', (ctx) => {
  const hits = requireIssues(ctx).filter((x) => x.message.includes('duplicate change id'));
  if (hits.length > 0) {
    throw new Error(`unexpected duplicate-change-id ERROR:\n${JSON.stringify(hits)}`);
  }
});

// r65 — 既有验收挂回规则不报错:原生结构下验收归属由嵌套决定,无孤儿/悬空域。
bdd.given('一个验收嵌套于 `规则:` 内的 spec 临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'nested.feature'),
    '# language: zh-CN\n# capability: nested\n# purpose: p\n# scope: llmanspec/\n\n功能: nested\n\n  @req:r91\n  规则: 规则\n    系统 MUST x\n\n    场景: 验收\n      假如 前置\n      当 动作\n      那么 结果\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'nested acceptance']);
  ctx.fixtures['验证仓库'] = { repo, id: 'nested' } satisfies ValidateRepoFixture;
});

bdd.thenStep('该 spec 条目 valid 为 true 且无孤儿 WARNING', (ctx) => {
  const r = ctx.fixtures['命令结果'] as { stdout: string };
  const parsed = JSON.parse(r.stdout) as { items?: DefectJsonItem[] };
  const item = (parsed.items ?? [])[0];
  if (!item) throw new Error(`no item in output:\n${r.stdout}`);
  if (item.valid !== true) throw new Error(`nested acceptance must keep the spec valid`);
  if (item.issues.some((x) => x.message.includes('orphan scenario'))) {
    throw new Error(`unexpected orphan WARNING:\n${JSON.stringify(item.issues)}`);
  }
  if (item.issues.some((x) => x.message.includes('has no matching rule'))) {
    throw new Error(`dangling-link ERROR must not fire:\n${JSON.stringify(item.issues)}`);
  }
});

// align-report-cli-surface D9/B23: 收口伪任务 WARNING(r78)。夹具:已绑定 change
// 且 tasks.md 含一条未勾选、以收口动词开头的任务「- [ ] T6: 收口——finalize」。
bdd.given('一个已绑定且含未勾选任务「- [ ] T6: 收口——finalize」的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-closeout';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'design.md'), '# design\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [ ] T6: 收口——finalize\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.given('一个已绑定且含未勾选任务「- [ ] T3: 修复 finalize 任务门」的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-fixgate';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'design.md'), '# design\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [ ] T3: 修复 finalize 任务门\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.thenStep('输出含 path 为 tasks 的 WARNING 且含 "finalize is a pipeline step"', (ctx) => {
  const r = ctx.fixtures['命令结果'] as { stdout: string };
  const parsed = JSON.parse(r.stdout) as { items?: DefectJsonItem[] };
  const tasks = (parsed.items ?? [])
    .flatMap((i) => i.issues ?? [])
    .filter((x) => x.level === 'WARNING' && x.path === 'tasks');
  if (tasks.length === 0) throw new Error(`no tasks-path WARNING:\n${r.stdout}`);
  if (!tasks.some((x) => x.message.includes('finalize is a pipeline step'))) {
    throw new Error(`missing pipeline-step hint:\n${JSON.stringify(tasks)}`);
  }
});

bdd.thenStep('退出码不因该 WARNING 变化(非 strict)', (ctx) => {
  const r = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  // 非 strict:单 change 的 WARNING 不改变退出码;exit 0(无 ERROR)
  if (r.code === 0) return;
  const parsed = JSON.parse(r.stdout) as { items?: DefectJsonItem[] };
  const hasError = (parsed.items ?? []).some((i) => !i.valid);
  if (!hasError) throw new Error(`exit ${r.code} despite no ERROR:\n${r.stdout}`);
});

bdd.thenStep('输出不含 "finalize is a pipeline step"', (ctx) => {
  const r = ctx.fixtures['命令结果'] as { stdout: string };
  if (r.stdout.includes('finalize is a pipeline step')) {
    throw new Error('close-out hint must not fire for a task ABOUT close-out');
  }
});

// ---------------------------------------------------------------------------
// r104 — tag-scoped transition-table validation gates
// ---------------------------------------------------------------------------

function scFeature(
  cap: string,
  reqId: string,
  scenario: string,
  stepBlock: string,
  tableRows: string,
  tags = '',
): string {
  return `# language: zh-CN
# purpose: ${cap}
功能: ${cap}

  @req:${reqId}
  规则: rule
    系统 MUST x

${tags}    场景大纲: ${scenario}
${stepBlock}
      例子:
        | from | event | to |
${tableRows}
`;
}

const GOOD_STEPS = `      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"`;

const GOOD_ROWS = `        | a | e1 | b |
        | b | e2 | c |`;

const ISLAND_ROWS = `        | a | e1 | b |
        | orphan | e0 | c |`;

function incompleteFeature(cap: string, reqId: string): string {
  return `# language: zh-CN
# purpose: ${cap}
功能: ${cap}

  @req:${reqId}
  规则: rule
    系统 MUST x

    场景大纲: incomplete
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | to |
        | a | b |
`;
}

function transitionsRepo(files: Record<string, string>): TempRepo {
  const repo = makeTempRepo();
  mkdirSync(join(repo.root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(repo.root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(repo.root, 'llmanspec', 'specs', name), content);
  }
  return repo;
}

// --- 场景: tag 定界四级判定 -----------------------------------------------

bdd.given(
  '一个分别含挂 @no-transitions 的孤岛缺陷特征词表、挂 @transitions 的残缺列表现、双 tag 同挂场景与无 tag 孤岛缺陷特征词表的临时仓库',
  (ctx) => {
    const repo = transitionsRepo({
      'sc-escape.feature': scFeature(
        'sc-escape',
        'r50',
        'escape',
        GOOD_STEPS,
        ISLAND_ROWS,
        '    @no-transitions\n',
      ),
      'sc-force.feature': `# language: zh-CN
# purpose: sc-force
功能: sc-force

  @req:r51
  规则: rule
    系统 MUST x

    @transitions
    场景大纲: force
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | to |
        | a | b |
`,
      'sc-conflict.feature': scFeature(
        'sc-conflict',
        'r52',
        'conflict',
        GOOD_STEPS,
        GOOD_ROWS,
        '    @transitions @no-transitions\n',
      ),
      'sc-island3.feature': scFeature('sc-island3', 'r53', 'island', GOOD_STEPS, ISLAND_ROWS),
    });
    ctx.fixtures['validate仓库'] = { repo };
  },
);

bdd.thenStep(
  '@no-transitions 孤岛表不报错,@transitions 残缺表报缺必填列 ERROR,双 tag 同挂报冲突 ERROR,无 tag 孤岛表照常报 ERROR',
  (ctx) => {
    const r = ctx.fixtures['validate结果'] as { code: number; stdout: string };
    if (r.code === 0) throw new Error('validate must fail for the conflict/island defects');
    const parsed = JSON.parse(r.stdout) as {
      items?: {
        id: string;
        valid: boolean;
        issues: { level: string; path: string; message: string }[];
      }[];
    };
    const byId = new Map((parsed.items ?? []).map((i) => [i.id, i]));
    const messagesOf = (id: string): string[] =>
      (byId.get(id)?.issues ?? [])
        .filter((x) => x.path.includes('/transitions/'))
        .map((x) => x.message);
    if (!byId.get('sc-escape')?.valid || messagesOf('sc-escape').length > 0) {
      throw new Error('@no-transitions must fully escape the island table');
    }
    const force = messagesOf('sc-force');
    if (
      byId.get('sc-force')?.valid ||
      !force.some((m) => m.includes('requires a runnable non-empty Examples table'))
    ) {
      throw new Error('@transitions must force E1 on the malformed table');
    }
    const conflict = messagesOf('sc-conflict');
    if (
      byId.get('sc-conflict')?.valid ||
      !conflict.some((m) => m.includes('conflicting @transitions and @no-transitions tags'))
    ) {
      throw new Error('both tags must conflict-ERROR');
    }
    if (
      byId.get('sc-island3')?.valid ||
      !messagesOf('sc-island3').some((m) => m.includes('unreachable state'))
    ) {
      throw new Error('no-tag sniff must still catch the island table');
    }
  },
);

// --- 场景: 四道门禁对嗅探路径逐类拦截 ---------------------------------------

bdd.given(
  '一个无任何 tag 且分别含残缺表头漏列或假步骤未绑定占位符、非确定性冲突、孤岛不可达状态与死锁陷阱状态四类缺陷表的临时仓库',
  (ctx) => {
    const repo = transitionsRepo({
      'sc-incomplete.feature': incompleteFeature('sc-incomplete', 'r9'),
      'sc-fake.feature': scFeature(
        'sc-fake',
        'r10',
        'fake',
        `      假如 固定
      当 固定
      那么 固定`,
        GOOD_ROWS,
      ),
      'sc-nondet.feature': scFeature(
        'sc-nondet',
        'r11',
        'dup',
        GOOD_STEPS,
        `        | a | e1 | b |
        | a | e1 | c |`,
      ),
      'sc-island2.feature': scFeature('sc-island2', 'r12', 'island', GOOD_STEPS, ISLAND_ROWS),
      'sc-dead.feature': scFeature(
        'sc-dead',
        'r13',
        'dead',
        GOOD_STEPS,
        `        | a | e1 | trap |
        | a | e2 | b |
        | trap | self | trap |
        | b | fin | done |`,
      ),
    });
    ctx.fixtures['validate仓库'] = { repo };
  },
);

bdd.thenStep(
  '四类状态流转缺陷均被自动发现并判 ERROR 且对应 capability valid 为 false 且退出码非零',
  (ctx) => {
    const r = ctx.fixtures['validate结果'] as { code: number; stdout: string };
    if (r.code === 0) throw new Error('validate must fail for transition defects');
    const parsed = JSON.parse(r.stdout) as {
      items?: {
        id: string;
        valid: boolean;
        issues: { level: string; path: string; message: string }[];
      }[];
    };
    const caps = ['sc-incomplete', 'sc-fake', 'sc-nondet', 'sc-island2', 'sc-dead'];
    for (const cap of caps) {
      const item = (parsed.items ?? []).find((i) => i.id === cap);
      if (!item || item.valid) throw new Error(`${cap} must be invalid`);
      if (!item.issues.some((x) => x.level === 'ERROR' && x.path.includes('/transitions/'))) {
        throw new Error(`${cap} must carry transitions ERROR`);
      }
    }
    const messages = (parsed.items ?? []).flatMap((i) => i.issues.map((x) => x.message));
    const need = [
      'transition scenario',
      'steps must bind placeholders',
      'non-deterministic or duplicate transition',
      'unreachable state',
      'deadlock state',
    ];
    for (const fragment of need) {
      if (!messages.some((m) => m.includes(fragment))) {
        throw new Error(`missing transition defect message containing: ${fragment}`);
      }
    }
  },
);

// --- 场景: E4 死锁消息按实际违反不变式表述 ----------------------------------

bdd.given(
  '一个分别含无法到达终态的死锁表、无终态且无法回到初始状态的单向环区表与合法纯环表的临时仓库',
  (ctx) => {
    const repo = transitionsRepo({
      'sc-term-dead.feature': scFeature(
        'sc-term-dead',
        'r60',
        'term-dead',
        GOOD_STEPS,
        `        | a | e1 | b |
        | a | e2 | c |
        | b | self | b |`,
      ),
      'sc-sink-cycle.feature': scFeature(
        'sc-sink-cycle',
        'r61',
        'sink-cycle',
        GOOD_STEPS,
        `        | a | e1 | b |
        | b | e2 | c |
        | c | e3 | b |`,
      ),
      'sc-pure-cycle.feature': scFeature(
        'sc-pure-cycle',
        'r62',
        'pure-cycle',
        GOOD_STEPS,
        `        | on | toggle | off |
        | off | toggle | on |`,
      ),
    });
    ctx.fixtures['validate仓库'] = { repo };
  },
);

bdd.thenStep(
  '死锁表消息含无法到达终态,单向环区表消息含无法回到初始状态,合法纯环表不报错',
  (ctx) => {
    const r = ctx.fixtures['validate结果'] as { code: number; stdout: string };
    if (r.code === 0) throw new Error('validate must fail for the two E4 defects');
    const parsed = JSON.parse(r.stdout) as {
      items?: {
        id: string;
        valid: boolean;
        issues: { level: string; path: string; message: string }[];
      }[];
    };
    const byId = new Map((parsed.items ?? []).map((i) => [i.id, i]));
    const transitionsMsgs = (id: string): string[] =>
      (byId.get(id)?.issues ?? [])
        .filter((x) => x.path.includes('/transitions/'))
        .map((x) => x.message);
    if (
      byId.get('sc-term-dead')?.valid ||
      !transitionsMsgs('sc-term-dead').some((m) => m.includes('cannot reach any terminal state'))
    ) {
      throw new Error('terminal-deadlock table must report cannot-reach-terminal');
    }
    if (
      byId.get('sc-sink-cycle')?.valid ||
      !transitionsMsgs('sc-sink-cycle').some((m) =>
        m.includes('cannot return to the initial state'),
      )
    ) {
      throw new Error('sink-cycle table must report cannot-return-to-initial');
    }
    if (!byId.get('sc-pure-cycle')?.valid || transitionsMsgs('sc-pure-cycle').length > 0) {
      throw new Error('pure cycle table must pass clean');
    }
  },
);
