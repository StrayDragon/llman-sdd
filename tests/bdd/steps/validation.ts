// Domain step definitions: validation 能力 — 覆盖 r11/r12(种子缺陷目录的
// 进程内校验聚合)、r47/r48(validate 旗标矩阵)、r32(INFO 级 issue 缺省
// 过滤)、r11/r13/r63/r64/r65(executable 化 HIGH 批:报告聚合、--check
// no-op、completeness/脏 specs WARNING、frontmatter 合法字段门、孤儿验收
// WARNING,全部走 CLI 子进程)。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { discoverSpecs, validateAllSpecs, type DiscoveryIo } from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI, type TempRepo, makeTempRepo } from './shared.ts';

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

bdd.given('一个含互斥 tag 与重复 req_id 缺陷的 specs 目录', (ctx) => {
  const files: Record<string, string> = {
    'llmanspec/specs/mutual.feature': `# language: zh-CN\n# capability: mutual\n# purpose: p\n# scope: llmanspec/\n\n功能: mutual\n\n  @req:r11 @human @executable\n  场景: 互斥\n    - 系统 MUST x\n`,
    'llmanspec/specs/dupa.feature': `# language: zh-CN\n# capability: dupa\n# purpose: p\n# scope: llmanspec/\n\n功能: dupa\n\n  @req:r20 @human\n  场景: ok\n    - 系统 MUST x\n`,
    'llmanspec/specs/dupb.feature': `# language: zh-CN\n# capability: dupb\n# purpose: p\n# scope: llmanspec/\n\n功能: dupb\n\n  @req:r20 @human\n  场景: ok\n    - 系统 MUST x\n`,
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
  const report = validateAllSpecs(entries, fixture.io);
  ctx.fixtures['校验结果'] = { failed: report.failed, lines: report.lines };
});

bdd.thenStep('FAIL 集合包含 spec 条目', (ctx) => {
  const result = ctx.fixtures['校验结果'] as ValidateResult | undefined;
  const failLines = result?.lines.filter((l) => l.startsWith('FAIL spec/')) ?? [];
  if (failLines.length === 0) {
    throw new Error(`no FAIL spec entries in:\n${result?.lines.join('\n')}`);
  }
});

bdd.thenStep('退出码非零', (ctx) => {
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
  const result = repo.run('bun', [CLI, 'validate', id, '--stage', 'full', '--no-check']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('退出码非零且按产物报阶段强制缺失(v1 语义)', (ctx) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`stage gate should fail: ${r.stdout}`);
  if (!`${r.stdout}${r.stderr}`.includes('Stage forced to')) {
    throw new Error(`stage gate message missing: ${r.stdout}${r.stderr}`);
  }
});

bdd.given('一个 run_command 含 {feature_name} 占位符的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  mkdirSync(join(repo.root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'auth.feature'),
    '# language: zh-CN\n# capability: auth\n# purpose: p\n# scope: llmanspec/\n\n功能: auth\n\n  @req:r2 @human\n  场景: 规则\n    - 系统 MUST x\n',
  );
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nbdd:\n  run_command: "bun --print \'feature={feature_name}\'"\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'cfg']);
  ctx.fixtures['validate仓库'] = { root: repo.root, repo, id: 'auth' };
});

bdd.when('运行 validate --specs', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--no-check']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('runner 按目标逐项执行', (ctx) => {
  // 占位符展开本身由单测覆盖;此处确认带占位符的 validate 全链路不炸且判定规格 OK
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  if (r.code !== 0) throw new Error(`validate with placeholders failed: ${r.stdout}${r.stderr}`);
});

// r32 — INFO-level issue default filtering (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含 pending 规则的有效 spec 工作区', (ctx) => {
  const repo = makeTempRepo();
  mkdirSync(join(repo.root, 'llmanspec', 'specs'), { recursive: true });
  // @human 规则无可执行验收覆盖 → 稳定产生一条 INFO 级 pending 提示,spec 仍 valid
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'auth.feature'),
    '# language: zh-CN\n# capability: auth\n# purpose: p\n# scope: llmanspec/\n\n功能: auth\n\n  @req:r2 @human\n  场景: 规则\n    - 系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  ctx.fixtures['info仓库'] = repo;
});

bdd.when('运行 validate --all --json 与 validate --all --json --include-info', (ctx) => {
  const repo = ctx.fixtures['info仓库'] as TempRepo;
  const def = repo.run('bun', [CLI, 'validate', '--all', '--json', '--no-check']);
  const full = repo.run('bun', [
    CLI,
    'validate',
    '--all',
    '--json',
    '--include-info',
    '--no-check',
  ]);
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
    '# language: zh-CN\n# capability: broken\n# purpose: p\n# scope: llmanspec/\n\n功能: broken\n\n  @req:r11 @human @executable\n  场景: 互斥\n    - 系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'seed defect']);
  ctx.fixtures['验证仓库'] = { repo, id: 'broken' } satisfies ValidateRepoFixture;
});

bdd.when('在该仓库运行 validate --specs --output human', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', '--specs', '--output', 'human']);
});

// r13 — redefined contract: --check/--no-check are v1-surface no-ops; the help
// text must describe the delegation reality instead of claiming harness runs.
bdd.given('一个含有效 specs 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  ctx.fixtures['验证仓库'] = { repo, id: 'sample' } satisfies ValidateRepoFixture;
});

bdd.when('分别以缺省、--check、--no-check 运行 validate --specs', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  const runs = [
    runCliCombined(repo, ['validate', '--specs']),
    runCliCombined(repo, ['validate', '--specs', '--check']),
    runCliCombined(repo, ['validate', '--specs', '--no-check']),
  ];
  ctx.fixtures['no-op三跑'] = runs;
  ctx.fixtures['命令结果'] = runs[runs.length - 1];
});

bdd.thenStep('三次运行的退出码与输出一致', (ctx) => {
  const runs = ctx.fixtures['no-op三跑'] as { code: number; stdout: string }[];
  const first = runs[0] as { code: number; stdout: string };
  for (const [i, r] of runs.entries()) {
    if (r.code !== first.code || r.stdout !== first.stdout) {
      throw new Error(
        `run ${i} diverged (code ${r.code} vs ${first.code}):\n${r.stdout}\n--- vs ---\n${first.stdout}`,
      );
    }
  }
});

bdd.when('运行 validate --help', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', '--help']);
});

bdd.thenStep('help 文案指向委托语义且不含执行 harness 宣称', (ctx) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes('no-op') || !out.includes('project test suite')) {
    throw new Error(
      `help text must state the delegation reality (no-op + project test suite):\n${out}`,
    );
  }
  if (/skip the bdd\.run_command check|run the bdd\.run_command check/u.test(out)) {
    throw new Error(`help text still claims validate executes the harness:\n${out}`);
  }
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

bdd.when('对该 change 运行 validate --json', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--json']);
});

const requireIssues = (ctx: {
  fixtures: Record<string, unknown>;
}): { level: string; path: string; message: string }[] => {
  const r = ctx.fixtures['命令结果'] as { stdout: string };
  const parsed = JSON.parse(r.stdout) as {
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

bdd.when('对该 change 运行 validate --output human', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

bdd.thenStep('输出含未知字段 "{field}" 与合法字段集提示', (ctx, field) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes(`unknown field '${field}'`)) {
    throw new Error(`unknown-field message for '${field}' missing:\n${out}`);
  }
  if (!out.includes('depends_on, blocks, branch, base_branch, base_sha, needs_specs_change')) {
    throw new Error(`allowed-field set missing from message:\n${out}`);
  }
});

bdd.when('把 frontmatter 改写为六个合法字段后再次运行 validate', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  writeFileSync(
    join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'),
    '---\ndepends_on: []\nblocks: []\nbranch: sdd/demo-fm\nbase_branch: main\nbase_sha: abc\nneeds_specs_change: false\n---\n\n## Why\nx\n',
  );
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

// r65 — orphan acceptance scenario WARNING with `<cap>/acceptance/<name>` path.
bdd.given('一个含孤儿验收场景的 spec 临时仓库', (ctx) => {
  const repo = makeTempRepo();
  // r91: makeTempRepo 的 sample.feature 已占用 r1 — req_id 全局唯一,撞号会误触
  // 重复 ERROR 使 spec 失真,r65 只观察孤儿 WARNING。
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'orph.feature'),
    '# language: zh-CN\n# capability: orph\n# purpose: p\n# scope: llmanspec/\n\n功能: orph\n\n  @req:r91 @human\n  场景: 规则\n    - 系统 MUST x\n\n  @executable\n  场景: 孤儿验收\n    假如 前置\n    当 动作\n    那么 结果\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'orphan']);
  ctx.fixtures['验证仓库'] = { repo, id: 'orph' } satisfies ValidateRepoFixture;
});

bdd.when('对该 spec 运行 validate --json', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--json']);
});

bdd.thenStep('孤儿验收 WARNING 的 path 为 "{path}"', (ctx, path) => {
  const r = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`validate --json failed: ${r.stdout}`);
  const parsed = JSON.parse(r.stdout) as {
    items: { id: string; issues: { level: string; path: string }[] }[];
  };
  const hit = parsed.items.flatMap((i) => i.issues).find((x) => x.path === path);
  if (!hit) throw new Error(`no issue with path '${path}' in:\n${r.stdout}`);
  if (hit.level !== 'WARNING') throw new Error(`expected WARNING at '${path}', got ${hit.level}`);
});
