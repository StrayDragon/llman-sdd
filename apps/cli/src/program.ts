/**
 * T17 program factory (cli r107): builds the full command tree WITHOUT
 * parsing argv or running any action. Importing this module (or calling
 * `createProgram`) must never execute a command — `main.ts` is the only
 * assembly+run entry.
 *
 * Assembly order is load-bearing: commander children copy _exitCallback at
 * creation time, so exitOverride/configureOutput must run before any
 * `registerXxx` call, and the register calls below must keep the original
 * top-level command order (help text renders in registration order).
 */
import { Command } from 'commander';

import { CliError, versionDisplay, type CliContext } from './cli-shared.ts';
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

export function createProgram(ctx: CliContext): Command {
  const program = new Command();

  // Must run before subcommand registration (children copy _exitCallback at
  // creation time); exitOverride turns commander's process.exit into a throw.
  program.exitOverride();
  program.configureOutput({ outputError: () => {} });

  program
    .name('llman-sdd')
    .description('Spec-driven development workflow')
    .version(versionDisplay());
  program.option(
    '--max-scan-depth <n>',
    'max depth when scanning llmanspec/changes/ for proposal.md (min 1, default 8)',
    '8',
  );
  // cli r75: a bare root invocation (also with root-only options) equals
  // --help — help to stdout, exit 0 via the commander.help path.
  program.action(() => {
    program.help();
  });

  registerInit(program, ctx);
  registerValidate(program, ctx);
  registerChange(program, ctx);
  registerList(program, ctx);
  registerShow(program, ctx);
  registerGraph(program, ctx);
  registerSpec(program, ctx);
  registerProject(program, ctx);
  registerArchive(program, ctx);
  registerReview(program, ctx);
  registerConfig(program, ctx);
  registerIndex(program, ctx);
  registerContext(program, ctx);

  // cli r75: pure parent groups (no default action of their own) reject bare
  // calls as usage errors — commander's missing-action help on stderr, rc 2
  // via missingParameter/…; `config` keeps its default action (overview, rc 0).
  for (const name of ['change', 'spec', 'project', 'archive', 'index']) {
    const group = program.commands.find((c) => c.name() === name);
    if (group === undefined) continue;
    group.action(() => {
      // commander's configureOutput silenced outputError; render the usage
      // line ourselves and exit through the shared CliError path (rc 2).
      group.outputHelp({ error: true });
      throw new CliError('', 2);
    });
  }

  return program;
}
