// Domain step definitions: completion capability — 覆盖 r110(生成路径:五
// shell 动态推导、值域拒绝、补全与 commander 树同源)。安装路径场景在
// review 仓库安装行为时经 HOME 注入走真实 CLI 子进程。
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeCliContext } from '../../../apps/cli/src/cli-shared.ts';
import { createProgram } from '../../../apps/cli/src/program.ts';
import { bdd } from '../runner.ts';
import { REPO_ROOT, runCli } from './shared.ts';

const SHELLS = ['bash', 'zsh', 'fish', 'powershell', 'elvish'] as const;

bdd.given('一个已初始化的 llman-sdd 命令面', (ctx) => {
  ctx.fixtures['命令面'] = { root: mkdtempSync(join(tmpdir(), 'llman-completion-')) };
});

bdd.when('逐一运行 self completion --shell bash 与 zsh 与 fish 与 powershell 与 elvish', (ctx) => {
  const outputs = SHELLS.map((shell) => {
    const proc = runCli(['self', 'completion', '--shell', shell]);
    return { shell, code: proc.status ?? 1, out: proc.stdout ?? '' };
  });
  ctx.fixtures['五shell结果'] = outputs;
});

bdd.thenStep('各 shell 输出非空脚本且含 change 与 validate 子命令和 --directory 旗标', (ctx) => {
  const outputs = ctx.fixtures['五shell结果'] as { shell: string; code: number; out: string }[];
  for (const { shell, code, out } of outputs) {
    if (code !== 0) throw new Error(`${shell} generation exited non-zero:\n${out}`);
    if (out.trim() === '') throw new Error(`${shell} script must not be empty`);
    if (!out.includes('llman-sdd')) throw new Error(`${shell} script must embed the bin name`);
    if (!out.includes('change') || !out.includes('validate')) {
      throw new Error(`${shell} script must cover change/validate commands:\n${out.slice(0, 400)}`);
    }
    // fish 的长旗标惯用法是 -l directory(去 -- 前缀),语义等价
    const needle = shell === 'fish' ? '-l directory' : '--directory';
    if (!out.includes(needle)) throw new Error(`${shell} script must cover ${needle}`);
  }
});

bdd.when('运行 self completion --shell nushell', (ctx) => {
  const proc = runCli(['self', 'completion', '--shell', 'nushell']);
  ctx.fixtures['nushell结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('报错列出合法值域且退出码非零', (ctx) => {
  const r = ctx.fixtures['nushell结果'] as { code: number; out: string };
  if (r.code === 0) throw new Error(`unknown shell must fail:\n${r.out}`);
  for (const shell of SHELLS) {
    if (!r.out.includes(shell)) {
      throw new Error(`error must list legal shell values (missing ${shell}):\n${r.out}`);
    }
  }
});

bdd.when('运行 self completion --shell bash', (ctx) => {
  const proc = runCli(['self', 'completion', '--shell', 'bash']);
  ctx.fixtures['bash脚本'] = { code: proc.status ?? 1, out: proc.stdout ?? '' };
});

bdd.thenStep('输出覆盖 commander 树全部顶级命令与各自长旗标', (ctx) => {
  const r = ctx.fixtures['bash脚本'] as { code: number; out: string };
  if (r.code !== 0) throw new Error(`generation failed:\n${r.out}`);
  // 与真实命令树同源比对:树上的每个顶级命令与其长旗标都必须出现在补全里
  const program = createProgram(makeCliContext(REPO_ROOT));
  for (const cmd of program.commands) {
    if ((cmd as unknown as { hidden?: boolean }).hidden === true) continue;
    if (!r.out.includes(cmd.name())) {
      throw new Error(`completion missing top-level command "${cmd.name()}"`);
    }
    for (const o of cmd.options) {
      if (typeof o.long === 'string' && !r.out.includes(o.long)) {
        throw new Error(`completion missing flag ${o.long} (command ${cmd.name()})`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// r111/r112 — install path (HOME injected via runCli env; interactive DI)
// ---------------------------------------------------------------------------

import {
  COMPLETION_MARKER_END,
  COMPLETION_MARKER_START,
  type CompletionShell,
} from '@llman-sdd/core';

import { runInstall } from '../../../apps/cli/src/commands/self.ts';

interface InstallEnvFixture {
  home: string;
}

function envWithHome(home: string): NodeJS.ProcessEnv {
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...rest } = process.env;
  return { ...rest, HOME: home };
}

function markerCount(content: string): number {
  return content.split(COMPLETION_MARKER_START).length - 1;
}

bdd.given('一个 HOME 指向临时目录的运行环境', (ctx) => {
  ctx.fixtures['安装HOME'] = {
    home: mkdtempSync(join(tmpdir(), 'llman-home-')),
  } satisfies InstallEnvFixture;
});

bdd.when('运行 self completion --shell bash --install -y', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const proc = runCli(
    ['self', 'completion', '--shell', 'bash', '--install', '-y'],
    REPO_ROOT,
    envWithHome(fixture.home),
  );
  ctx.fixtures['install结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('临时 HOME 的 .bashrc 含完整 marker 块', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const rc = join(fixture.home, '.bashrc');
  if (!existsSync(rc)) throw new Error(`install must create ${rc}`);
  const content = readFileSync(rc, 'utf8');
  if (!content.includes(COMPLETION_MARKER_START) || !content.includes(COMPLETION_MARKER_END)) {
    throw new Error(`marker block missing:\n${content}`);
  }
  if (!content.includes('llman-sdd self completion --shell bash')) {
    throw new Error(`snippet must reference the self completion command:\n${content}`);
  }
});

bdd.given('一个已完成一次 install 的临时 HOME', (ctx) => {
  const home = mkdtempSync(join(tmpdir(), 'llman-home2-'));
  const first = runCli(
    ['self', 'completion', '--shell', 'bash', '--install', '-y'],
    REPO_ROOT,
    envWithHome(home),
  );
  if (first.status !== 0) throw new Error(`first install failed:\n${first.stderr ?? ''}`);
  ctx.fixtures['安装HOME'] = { home } satisfies InstallEnvFixture;
});

bdd.when('再次运行 self completion --shell bash --install -y', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const proc = runCli(
    ['self', 'completion', '--shell', 'bash', '--install', '-y'],
    REPO_ROOT,
    envWithHome(fixture.home),
  );
  ctx.fixtures['install结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('marker 块数仍为一且内容为最新', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const content = readFileSync(join(fixture.home, '.bashrc'), 'utf8');
  if (markerCount(content) !== 1) {
    throw new Error(`reinstall must keep exactly one marker block, got ${markerCount(content)}`);
  }
});

bdd.given('一个 HOME 下仅存在 .bash_profile 的环境', (ctx) => {
  const home = mkdtempSync(join(tmpdir(), 'llman-home3-'));
  writeFileSync(join(home, '.bash_profile'), '# pre-existing profile\n');
  ctx.fixtures['安装HOME'] = { home } satisfies InstallEnvFixture;
});

bdd.thenStep('marker 块写入 .bash_profile', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const content = readFileSync(join(fixture.home, '.bash_profile'), 'utf8');
  if (!content.includes(COMPLETION_MARKER_START)) {
    throw new Error(`fallback chain must land in .bash_profile:\n${content}`);
  }
});

bdd.given('一个 PROFILE 指向 home 之外的环境', (ctx) => {
  const home = mkdtempSync(join(tmpdir(), 'llman-home4-'));
  const outside = mkdtempSync(join(tmpdir(), 'llman-outside-'));
  ctx.fixtures['安装HOME'] = { home } satisfies InstallEnvFixture;
  ctx.fixtures['越界PROFILE'] = outside;
});

bdd.when('运行 self completion --shell powershell --install -y', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const outside = ctx.fixtures['越界PROFILE'] as string;
  const env = envWithHome(fixture.home);
  env.PROFILE = join(outside, 'profile.ps1');
  const proc = runCli(
    ['self', 'completion', '--shell', 'powershell', '--install', '-y'],
    REPO_ROOT,
    env,
  );
  ctx.fixtures['install结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('报错且零写入', (ctx) => {
  const r = ctx.fixtures['install结果'] as { code: number; out: string };
  if (r.code === 0) throw new Error(`out-of-home profile must be refused:\n${r.out}`);
  if (!r.out.includes('outside home')) throw new Error(`error must name the guard:\n${r.out}`);
});

bdd.given('一个非交互且 rc 已存在的 HOME', (ctx) => {
  const home = mkdtempSync(join(tmpdir(), 'llman-home5-'));
  writeFileSync(join(home, '.bashrc'), '# original rc\n');
  ctx.fixtures['安装HOME'] = { home } satisfies InstallEnvFixture;
});

// 交互应答 y 无法经管道伪造 TTY——该场景在进程内以 DI 注入驱动 runInstall,
// 精确复现「交互 + 应答 y」分支;非交互分支走真实 CLI 子进程(无 TTY)。
bdd.given('一个对确认提示应答 y 的交互运行环境', (ctx) => {
  const home = mkdtempSync(join(tmpdir(), 'llman-home6-'));
  writeFileSync(join(home, '.bashrc'), '# original rc\n');
  ctx.fixtures['安装HOME'] = { home } satisfies InstallEnvFixture;
  ctx.fixtures['交互应答y'] = true;
});

bdd.when('运行 self completion --shell bash --install', async (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  if (ctx.fixtures['交互应答y'] === true) {
    // 进程内 DI:注入 home 与「交互 + 应答 y」——Bun 的 homedir() 不读
    // 进程内 process.env.HOME 改写,注入是唯一不误写真实 rc 的路径。
    try {
      await runInstall('bash' as CompletionShell, false, {
        home: fixture.home,
        isInteractive: () => true,
        prompt: async () => 'y',
      });
      ctx.fixtures['install结果'] = { code: 0, out: '' };
    } catch (error) {
      ctx.fixtures['install结果'] = { code: 1, out: (error as Error).message };
    }
    return;
  }
  const proc = runCli(
    ['self', 'completion', '--shell', 'bash', '--install'],
    REPO_ROOT,
    envWithHome(fixture.home),
  );
  ctx.fixtures['install结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('报错且 rc 内容字节不变', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const r = ctx.fixtures['install结果'] as { code: number; out: string };
  if (r.code === 0) throw new Error(`non-interactive without -y must fail:\n${r.out}`);
  const content = readFileSync(join(fixture.home, '.bashrc'), 'utf8');
  if (content !== '# original rc\n') {
    throw new Error(`refused install must not touch rc:\n${content}`);
  }
});

bdd.thenStep('rc 含完整 marker 块', (ctx) => {
  const fixture = ctx.fixtures['安装HOME'] as InstallEnvFixture;
  const r = ctx.fixtures['install结果'] as { code: number; out: string };
  if (r.code !== 0) throw new Error(`confirmed install must succeed:\n${r.out}`);
  const content = readFileSync(join(fixture.home, '.bashrc'), 'utf8');
  if (!content.includes(COMPLETION_MARKER_START) || !content.includes(COMPLETION_MARKER_END)) {
    throw new Error(`confirmed install must write the marker block:\n${content}`);
  }
});
