import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
/**
 * `self` command group (completion capability r110-r112): shell-completion
 * generation from the live commander tree and marker-idempotent rc install
 * with a confirmation gate. Terminal interaction stays in this CLI adapter
 * (core owns only pure text transforms), per the AGENTS interaction rule.
 */
import { createInterface } from 'node:readline';

import {
  COMPLETION_BIN,
  COMPLETION_SHELLS,
  completionBlock,
  isCompletionShell,
  renderCompletionScript,
  resolveBashRc,
  upsertCompletionBlock,
  type CompletionCommandSpec,
  type CompletionShell,
} from '@llman-sdd/core';
import { type Command } from 'commander';

import { CliError, type CliContext } from '../cli-shared.ts';

/** Extract the completion IR from the live commander tree — no second manifest. */
export function extractCompletionSpec(program: Command): CompletionCommandSpec {
  const walk = (cmd: Command): CompletionCommandSpec => ({
    name: cmd.name(),
    flags: cmd.options.map((o) => o.long).filter((f): f is string => typeof f === 'string'),
    subcommands: cmd.commands
      .filter((c) => (c as unknown as { hidden?: boolean }).hidden !== true)
      .map(walk),
  });
  return walk(program);
}

function completionSnippet(shell: CompletionShell): string {
  switch (shell) {
    case 'bash':
    case 'zsh':
      return `source <(${COMPLETION_BIN} self completion --shell ${shell})`;
    case 'fish':
      return `${COMPLETION_BIN} self completion --shell fish | source`;
    case 'powershell':
      return `${COMPLETION_BIN} self completion --shell powershell | Out-String | Invoke-Expression`;
    case 'elvish':
      return `eval (${COMPLETION_BIN} self completion --shell elvish)`;
  }
}

/** rc/profile target for one shell (r111). Bash keeps the 3-step fallback chain. */
export function resolveRcPath(shell: CompletionShell, home: string): string {
  switch (shell) {
    case 'bash':
      return resolveBashRc(home, (p) => existsSync(p));
    case 'zsh':
      return join(home, '.zshrc');
    case 'fish':
      return join(home, '.config', 'fish', 'config.fish');
    case 'powershell':
      return resolvePowerShellProfile(home);
    case 'elvish':
      return join(home, '.elvish', 'rc.elv');
  }
}

function resolvePowerShellProfile(home: string): string {
  const envProfile = process.env.PROFILE?.trim();
  if (envProfile !== undefined && envProfile !== '') {
    const absolute = isAbsolute(envProfile) ? resolve(envProfile) : resolve(envProfile);
    const homeAbs = resolve(home);
    if (absolute === homeAbs || absolute.startsWith(homeAbs + sep)) return absolute;
    throw new CliError(`powershell profile resolves outside home: ${absolute}`, 2);
  }
  return join(home, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1');
}

/** Confirmation gate (r112): TTY prompt, `-y` bypass, non-interactive → refuse. */
export async function confirmInstall(
  rcPath: string,
  yes: boolean,
  deps: { isInteractive?: () => boolean; prompt?: (text: string) => Promise<string> } = {},
): Promise<boolean> {
  if (yes) return true;
  const isInteractive = deps.isInteractive ?? (() => process.stdin.isTTY === true);
  const prompt =
    deps.prompt ??
    ((text: string) =>
      new Promise<string>((resolvePrompt) => {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        rl.question(text, (answer) => {
          rl.close();
          resolvePrompt(answer);
        });
      }));
  if (!isInteractive()) return false;
  const answer = await prompt(`Install ${COMPLETION_BIN} completion block into ${rcPath}? [y/N] `);
  return /^y(?:es)?$/iu.test(answer.trim());
}

export interface InstallDeps {
  /** Injectable home (tests); defaults to os.homedir() — Bun's homedir()
   * ignores in-process process.env.HOME writes, so tests MUST inject. */
  home?: string;
  isInteractive?: () => boolean;
  prompt?: (text: string) => Promise<string>;
}

export async function runInstall(
  shell: CompletionShell,
  yes: boolean,
  deps: InstallDeps = {},
): Promise<void> {
  const home = deps.home ?? homedir();
  const rcPath = resolveRcPath(shell, home);
  const confirmed = await confirmInstall(rcPath, yes, {
    isInteractive: deps.isInteractive,
    prompt: deps.prompt,
  });
  if (!confirmed) {
    throw new CliError(`non-interactive session without --yes — refusing to write ${rcPath}`, 2);
  }
  const existing = existsSync(rcPath) ? readFileSync(rcPath, 'utf8') : '';
  const snippet = completionSnippet(shell);
  const { content } = upsertCompletionBlock(existing, snippet);
  mkdirSync(dirname(rcPath), { recursive: true });
  writeFileSync(rcPath, content);
  console.log(completionBlock(snippet));
}

export function registerSelf(program: Command, _ctx: CliContext): void {
  const self = program.command('self').description('Self-inspection surface (shell completion)');

  self
    .command('completion')
    .description('Generate or install shell completions (generation prints to stdout)')
    .requiredOption('--shell <shell>', `target shell (${COMPLETION_SHELLS.join('|')})`)
    .option('--install', 'install the marker-wrapped snippet block into the shell rc/profile')
    .option('-y, --yes', 'skip the confirmation prompt (only meaningful with --install)')
    .action(async (options: { shell: string; install?: boolean; yes?: boolean }) => {
      const shell = options.shell.toLowerCase();
      if (!isCompletionShell(shell)) {
        throw new CliError(
          `unknown shell "${options.shell}" — legal values: ${COMPLETION_SHELLS.join(', ')}`,
          2,
        );
      }
      if (options.install === true) {
        await runInstall(shell, options.yes === true);
        return;
      }
      process.stdout.write(renderCompletionScript(extractCompletionSpec(program), shell));
    });
}
