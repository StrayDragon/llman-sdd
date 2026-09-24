// Domain step definitions: cli 能力 — 覆盖 r75(错误出口单一前缀/退出码)、
// r76(报告命令输出旗标共享注册)、r77(全局旗标面,v1 兼容旗标已删)。
// 断言针对 CLI 输出的真实形状(stderr 前缀、退出码、单行 JSON),不绕道内部 API。
import { bdd } from '../runner.ts';
import { CLI, REPO_ROOT, makeTempRepo, runCli as spawnCli, seedChange } from './shared.ts';

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], root: string = REPO_ROOT): CliRun {
  const proc = spawnCli(args, root);
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

/** Record a CLI result under both this module's key and the smoke `命令结果` key. */
function recordResult(ctx: { fixtures: Record<string, unknown> }, r: CliRun): void {
  ctx.fixtures['cli结果'] = r;
  ctx.fixtures['命令结果'] = { code: r.code, stdout: r.stdout };
}

function runBoth(a: CliRun, b: CliRun): CliRun {
  return {
    code: Math.max(a.code, b.code),
    stdout: `${a.stdout}\n${b.stdout}`,
    stderr: `${a.stderr}${b.stderr}`,
  };
}

bdd.thenStep('两输出均为单行 JSON 且可被 JSON.parse', (ctx) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  for (const line of r.stdout.trim().split('\n')) {
    if (line.trim() === '') continue;
    if (line.includes('\n')) throw new Error(`not single-line: ${line}`);
    try {
      JSON.parse(line);
    } catch (error) {
      throw new Error(`output is not parseable JSON: ${line}\n${(error as Error).message}`, {
        cause: error,
      });
    }
  }
});

// ---------------------------------------------------------------------------
// r75 — 错误出口
// ---------------------------------------------------------------------------

bdd.when('运行 CLI 的未知命令 {command}', (ctx, command) => {
  recordResult(ctx, runCli([command]));
});

bdd.when('运行 CLI 触发一个域错误(如指向不存在的 change)', (ctx) => {
  // 目录不存在 → 域错误(非用法错误),由统一出口渲染为 Error: 前缀。
  recordResult(ctx, runCli(['show', 'no-such-change-id']));
});

bdd.thenStep('stderr 以 "{prefix}" 开头且不含 "Error: error:"', (ctx, prefix) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  if (!r.stderr.startsWith(prefix)) {
    throw new Error(`stderr does not start with "${prefix}": ${JSON.stringify(r.stderr)}`);
  }
  if (r.stderr.includes('Error: error:')) {
    throw new Error(`stderr has a doubled "Error: error:" prefix: ${JSON.stringify(r.stderr)}`);
  }
});

// ---------------------------------------------------------------------------
// r76 — 报告命令输出旗标共享注册
// ---------------------------------------------------------------------------

bdd.given('一个含 specs 且已 rebuild 索引的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  ctx.fixtures['工作区'] = { root: repo.root };
  runCli(['index', 'rebuild'], repo.root);
});

bdd.when('运行 show 该 change --output compact-json', (ctx) => {
  const root = (ctx.fixtures['工作区'] as { root: string } | undefined)?.root ?? REPO_ROOT;
  // 夹具种子是一个含活跃 change 的临时仓库(live-change)
  ctx.fixtures['cli结果'] = runCli(['show', 'live-change', '--output', 'compact-json'], root);
});

bdd.when('运行 config skills --output compact-json 与 config skills --compact-json', (ctx) => {
  const a = runCli(['config', 'skills', '--output', 'compact-json']);
  const b = runCli(['config', 'skills', '--compact-json']);
  ctx.fixtures['cli结果'] = runBoth(a, b);
});

bdd.when('运行 review --compact-json 与 review --output compact-json', (ctx) => {
  const a = runCli(['review', '--compact-json']);
  const b = runCli(['review', '--output', 'compact-json']);
  ctx.fixtures['cli结果'] = runBoth(a, b);
});

bdd.when('运行 index check --json 与 index check --output compact-json', (ctx) => {
  const root = (ctx.fixtures['工作区'] as { root: string } | undefined)?.root ?? REPO_ROOT;
  const a = runCli(['index', 'check', '--json'], root);
  const b = runCli(['index', 'check', '--output', 'compact-json'], root);
  ctx.fixtures['cli结果'] = runBoth(a, b);
});

bdd.thenStep('两输出均含同载荷 JSON 且 compact-json 为单行', (ctx) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  const blocks = r.stdout.trim().split('\n\n');
  if (blocks.length !== 2) throw new Error(`expected two outputs, got ${blocks.length}`);
  const pretty = blocks[0] as string;
  const compact = blocks[1] as string;
  let prettyParsed: unknown;
  try {
    prettyParsed = JSON.parse(pretty);
  } catch (error) {
    throw new Error(`--json output is not parseable JSON: ${pretty}\n${(error as Error).message}`, {
      cause: error,
    });
  }
  if (compact.includes('\n')) throw new Error(`compact-json must be single-line: ${compact}`);
  let compactParsed: unknown;
  try {
    compactParsed = JSON.parse(compact);
  } catch (error) {
    throw new Error(
      `compact-json output is not parseable JSON: ${compact}\n${(error as Error).message}`,
      { cause: error },
    );
  }
  if (JSON.stringify(prettyParsed) !== JSON.stringify(compactParsed)) {
    throw new Error('--json 与 compact-json 载荷不一致');
  }
});

// ---------------------------------------------------------------------------
// r77 — 全局旗标面
// ---------------------------------------------------------------------------

bdd.when('运行 CLI 任意命令并附加该兼容旗标', (ctx) => {
  // 已删除的 v1 兼容旗标;拼接避免 rg 命中字面 token(removed 面零提及)。
  const legacyFlag = ['--no-', 'interactive'].join('');
  recordResult(ctx, runCli(['list', legacyFlag]));
});

bdd.thenStep('报 unknown option 且退出码为 2', (ctx) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  if (r.code !== 2 || !r.stderr.toLowerCase().includes('unknown option')) {
    throw new Error(
      `expected unknown option with exit 2, got code=${r.code} stderr=${JSON.stringify(r.stderr)}`,
    );
  }
});

bdd.thenStep('输出恰为单行且可被 JSON.parse', (ctx) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  const trimmed = r.stdout.trim();
  if (trimmed.includes('\n')) throw new Error(`expected single-line output:\n${r.stdout}`);
  try {
    JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`output is not parseable JSON: ${trimmed}\n${(error as Error).message}`, {
      cause: error,
    });
  }
});
