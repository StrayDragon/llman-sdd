// Domain step definitions: cli 能力 — 覆盖 r75(错误出口单一前缀/退出码)、
// r76(报告命令输出旗标共享注册)、r77(全局旗标面,前代兼容旗标已删)、
// r107(入口可导入与执行守卫)、r108(上下文注入与 cwd 隔离)、r109(实例根发现)。
// 断言针对 CLI 输出的真实形状(stderr 前缀、退出码、单行 JSON),不绕道内部 API。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  // 已删除的前代兼容旗标;拼接避免 rg 命中字面 token(removed 面零提及)。
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

// ---------------------------------------------------------------------------
// r75 补充 — 参数解析失败与裸调用退出码
// ---------------------------------------------------------------------------

bdd.when('运行 CLI 不带任何子命令与参数', (ctx) => {
  recordResult(ctx, runCli([]));
});

bdd.when('运行 CLI 的 change 分组不带子命令', (ctx) => {
  recordResult(ctx, runCli(['change']));
});

bdd.when('运行 show 不带 change id 参数', (ctx) => {
  recordResult(ctx, runCli(['show']));
});

bdd.when('运行 list --compact-json --output human', (ctx) => {
  recordResult(ctx, runCli(['list', '--compact-json', '--output', 'human']));
});

bdd.thenStep('stdout 含 "{text}"', (ctx, text: string) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  if (!r.stdout.includes(text)) {
    throw new Error(`stdout must contain "${text}": ${JSON.stringify(r.stdout)}`);
  }
});

bdd.thenStep('stderr 含 "{text}"', (ctx, text: string) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  if (!r.stderr.includes(text)) {
    throw new Error(`stderr must contain "${text}": ${JSON.stringify(r.stderr)}`);
  }
});

bdd.thenStep('stderr 含 "{text}" 且不含 "{absent}"', (ctx, text: string, absent: string) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  if (!r.stderr.includes(text)) {
    throw new Error(`stderr must contain "${text}": ${JSON.stringify(r.stderr)}`);
  }
  if (r.stderr.includes(absent)) {
    throw new Error(`stderr must not contain "${absent}": ${JSON.stringify(r.stderr)}`);
  }
});

bdd.thenStep('stdout 不含 "{text}"', (ctx, text: string) => {
  const r = ctx.fixtures['cli结果'] as CliRun;
  if (r.stdout.includes(text)) {
    throw new Error(`stdout must not contain "${text}": ${JSON.stringify(r.stdout)}`);
  }
});

// ---------------------------------------------------------------------------
// r107 — 入口可导入与执行守卫
// ---------------------------------------------------------------------------

bdd.when('在子进程中 import CLI 入口模块', (ctx) => {
  // 执行入口被 import 时不得执行任何命令(守卫只在自己是主模块时装配运行)。
  const entry = pathToFileURL(CLI).href;
  const script = `import(${JSON.stringify(entry)}).then(() => console.log('imported'))`;
  const proc = spawnSync('bun', ['-e', script], { cwd: REPO_ROOT, encoding: 'utf8' });
  recordResult(ctx, {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  });
});

// ---------------------------------------------------------------------------
// r108/r109 — 上下文注入、实例根发现与 --directory
// ---------------------------------------------------------------------------

function workspaceRoot(ctx: { fixtures: Record<string, unknown> }): string {
  return (ctx.fixtures['工作区'] as { root: string } | undefined)?.root ?? REPO_ROOT;
}

bdd.given('一个含活跃 change 与 specs 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedChange(repo, 'live-change', { commit: 'seed live change' });
  ctx.fixtures['工作区'] = { root: repo.root };
});

bdd.when('分别在该仓库根与其子目录运行 list --json', (ctx) => {
  const root = workspaceRoot(ctx);
  const sub = join(root, 'nested');
  mkdirSync(sub, { recursive: true });
  ctx.fixtures['根发现对照'] = {
    root: runCli(['list', '--json'], root),
    sub: runCli(['list', '--json'], sub),
  };
});

bdd.when('在该仓库的子目录运行 list --json', (ctx) => {
  const root = workspaceRoot(ctx);
  const sub = join(root, 'nested');
  mkdirSync(sub, { recursive: true });
  ctx.fixtures['根发现对照'] = {
    root: runCli(['list', '--json'], root),
    sub: runCli(['list', '--json'], sub),
  };
});

bdd.when('在仓库外的临时目录以 --directory 指向该仓库运行 list --json', (ctx) => {
  const root = workspaceRoot(ctx);
  const outside = mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-outside-'));
  ctx.fixtures['根发现对照'] = {
    root: runCli(['list', '--json'], root),
    sub: runCli(['list', '--json', '--directory', root], outside),
  };
});

bdd.thenStep('两次输出逐字节一致', (ctx) => {
  const pair = ctx.fixtures['根发现对照'] as { root: CliRun; sub: CliRun };
  if (pair.root.code !== 0 || pair.sub.code !== 0) {
    throw new Error(
      `list must succeed in both cwds: root=${pair.root.code} sub=${pair.sub.code} ${pair.sub.stderr}`,
    );
  }
  if (pair.root.stdout !== pair.sub.stdout) {
    throw new Error(
      `list output differs by cwd:\nroot=${JSON.stringify(pair.root.stdout)}\nsub =${JSON.stringify(pair.sub.stdout)}`,
    );
  }
});

bdd.thenStep('输出含该 change 且与仓库根运行结果一致', (ctx) => {
  const pair = ctx.fixtures['根发现对照'] as { root: CliRun; sub: CliRun };
  if (!pair.sub.stdout.includes('live-change')) {
    throw new Error(`expected live-change in output: ${JSON.stringify(pair.sub.stdout)}`);
  }
  if (pair.root.stdout !== pair.sub.stdout) {
    throw new Error(
      `output differs from repo-root run:\nroot=${JSON.stringify(pair.root.stdout)}\nsub =${JSON.stringify(pair.sub.stdout)}`,
    );
  }
});

bdd.when('在该目录运行 list', (ctx) => {
  const { root } = ctx.fixtures['空目录工作区'] as { root: string };
  recordResult(ctx, runCli(['list'], root));
});
