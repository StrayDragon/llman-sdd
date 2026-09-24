#!/usr/bin/env bun
import { Command } from 'commander';

import { CliError, version } from './cli-shared.ts';
import { registerArchive } from './commands/archive.ts';
import { registerChange } from './commands/change.ts';
import { registerConfig } from './commands/config.ts';
import { registerContext } from './commands/context.ts';
import { registerGraph } from './commands/graph.ts';
import { registerIndex } from './commands/index.ts';
import { registerInit } from './commands/init.ts';
import { registerList } from './commands/list.ts';
import { registerProject } from './commands/project.ts';
import { registerReview } from './commands/review.ts';
import { registerShow } from './commands/show.ts';
import { registerSpec } from './commands/spec.ts';
import { registerValidate } from './commands/validate.ts';

// Assembly order is load-bearing: commander children copy _exitCallback at
// creation time, so exitOverride/configureOutput must run before any
// `registerXxx` call, and the register calls below must keep the original
// top-level command order (help text renders in registration order).
const program = new Command();

// Must run before subcommand registration (children copy _exitCallback at
// creation time); exitOverride turns commander's process.exit into a throw.
program.exitOverride();
program.configureOutput({ outputError: () => {} });

program.name('llman-sdd').description('Spec-driven development workflow').version(version);
program.option(
  '--max-scan-depth <n>',
  'max depth when scanning llmanspec/changes/ for proposal.md (min 1, default 8)',
  '8',
);

registerInit(program);
registerValidate(program);
registerChange(program);
registerList(program);
registerShow(program);
registerGraph(program);
registerSpec(program);
registerProject(program);
registerArchive(program);
registerReview(program);
registerConfig(program);
registerIndex(program);
registerContext(program);

function commandChain(argv: string[]): string {
  let node: Command = program;
  let chain = '';
  let rest = argv.slice(2);
  while (rest.length > 0) {
    let child: Command | undefined;
    for (const cmd of node.commands) {
      if (cmd.name() === rest[0]) {
        child = cmd;
        break;
      }
    }
    if (child === undefined) break;
    chain += ` ${child.name()}`;
    node = child;
    rest = rest.slice(1);
  }
  return chain;
}

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const comErr = error as { code?: string; exitCode?: number; message?: string };
    if (
      comErr?.code === 'commander.version' ||
      comErr?.code === 'commander.help' ||
      comErr?.code === 'commander.helpDisplayed' ||
      comErr?.exitCode === 0
    ) {
      // version/help already rendered to stdout; exit code stays 0.
      return;
    }

    // commander strips its own `error: ` short prefix — single `Error: ` + rc=2.
    const commanderMsg = String(comErr?.message ?? '');
    const stripCommanderPrefix = (text: string): string => text.replace(/^error:\s*/u, '');

    if (comErr?.code === 'commander.unknownOption') {
      const raw = stripCommanderPrefix(commanderMsg);
      const arg = raw.replace(/^unknown option ['"]/u, '').replace(/['"]?\s*$/u, '') ?? '';
      const chain = commandChain(process.argv);
      console.error(`Error: unknown option '${arg}'`);
      console.error('');
      console.error(`Usage: llman-sdd${chain} [OPTIONS]`);
      console.error('');
      console.error("For more information, try '--help'.");
      process.exitCode = 2;
      return;
    }
    if (comErr?.code === 'commander.unknownCommand') {
      const raw = stripCommanderPrefix(commanderMsg);
      console.error(
        `Error: unknown command '${raw.replace(/^unknown command ['"]/u, '').replace(/['"]?\s*$/u, '')}'`,
      );
      process.exitCode = 2;
      return;
    }
    if (comErr instanceof CliError) {
      const message = stripCommanderPrefix(comErr.message);
      console.error(message.startsWith('Error: ') ? message : `Error: ${message}`);
      process.exitCode = comErr.exitCode;
      return;
    }

    // v1 parity: expected domain errors surface as a single `Error: <message>`
    // line on stderr with exit code 1 (no Bun stack trace).
    const message = stripCommanderPrefix(error instanceof Error ? error.message : String(error));
    console.error(message.startsWith('Error: ') ? message : `Error: ${message}`);
    process.exitCode = 1;
  }
}

await main();
