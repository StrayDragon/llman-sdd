// Smoke step definitions — prove the seam class this runner drives: shell
// commands, filesystem fixtures, and the {param}/{param:d} placeholder forms.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { bdd, type TestContext } from '../runner.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

interface RunResult {
  code: number;
  stdout: string;
}

bdd.given('工作目录是仓库根', (ctx: TestContext) => {
  if (!existsSync(join(REPO_ROOT, 'package.json'))) {
    throw new Error(`repo root not found at ${REPO_ROOT}`);
  }
  ctx.fixtures['仓库根'] = { 路径: REPO_ROOT };
  return ctx.fixtures['仓库根'] as Record<string, unknown>;
});

bdd.when('执行命令 "{command}"', (ctx: TestContext, command: string) => {
  const cwd = String(ctx.fixtures['仓库根']?.['路径'] ?? REPO_ROOT);
  const [bin, ...args] = command.split(' ');
  if (!bin) throw new Error(`empty command: ${command}`);
  let code = 0;
  let stdout = '';
  try {
    stdout = execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    code = e.status ?? 1;
    stdout = e.stdout ?? '';
  }
  ctx.fixtures['命令结果'] = { code, stdout };
  return ctx.fixtures['命令结果'] as Record<string, unknown>;
});

bdd.thenStep('退出码为 {code:d}', (ctx: TestContext, code: number) => {
  const result = ctx.fixtures['命令结果'];
  if (!result) throw new Error('no command result in fixtures — did the 当 step run?');
  if (result['code'] !== code) {
    throw new Error(`expected exit code ${code}, got ${result['code']}`);
  }
});

bdd.thenStep('stdout 符合正则 "{pattern}"', (ctx: TestContext, pattern: string) => {
  const result = ctx.fixtures['命令结果'];
  if (!result) throw new Error('no command result in fixtures — did the 当 step run?');
  if (!new RegExp(pattern).test(String(result['stdout']))) {
    throw new Error(`stdout ${JSON.stringify(result['stdout'])} does not match /${pattern}/`);
  }
});

bdd.given('一个计数器初始为 {count:d}', (ctx: TestContext, count: number) => {
  ctx.fixtures['计数器'] = { 值: count };
  return ctx.fixtures['计数器'] as Record<string, unknown>;
});

bdd.when('计数器递增 {times:d} 次', (ctx: TestContext, times: number) => {
  const counter = ctx.fixtures['计数器'] ?? { 值: 0 };
  counter['值'] = Number(counter['值']) + times;
  ctx.fixtures['计数器'] = counter;
});

bdd.thenStep('计数器的值为 {expected:d}', (ctx: TestContext, expected: number) => {
  const counter = ctx.fixtures['计数器'];
  if (!counter) throw new Error('no counter in fixtures');
  if (Number(counter['值']) !== expected) {
    throw new Error(`expected counter ${expected}, got ${counter['值']}`);
  }
});
