#!/usr/bin/env bun
// Execution entry only (cli r107): assemble the command tree via the factory,
// parse argv and render the unified error exits. Safe to import — nothing runs
// unless this module is the main module (guard at the bottom).
import { realpathSync } from 'node:fs';

import { CliError, makeCliContext } from './cli-shared.ts';
import { createProgram } from './program.ts';

function commandChain(argv: string[]): string {
  // Re-parse argv against a fresh tree for the unknown-command/option usage line.
  const program = createProgram(makeCliContext());
  let node = program;
  let chain = '';
  let rest = argv.slice(2);
  while (rest.length > 0) {
    let child;
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
  // r108: run context resolved ONCE at assembly time — command bodies take
  // io/git/root/cwd from here instead of reading process state ad hoc.
  const program = createProgram(makeCliContext());
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

    // cli r75: every remaining commander parse failure is a usage error —
    // missingArgument / excessArguments / invalidArgument / invalidOption …
    // — rendered through the shared single-prefix exit with rc 2. Handler
    // level enum validation throws CliError(…, 2) itself (intentional
    // divergence from the predecessor's rc 1).
    if (typeof comErr?.code === 'string' && comErr.code.startsWith('commander.')) {
      // r75: an unknown token at root level surfaces as excessArguments (the
      // root action owns the bare call) — render the unknown-command shape.
      const rootExcess =
        comErr.code === 'commander.excessArguments' &&
        process.argv.length > 2 &&
        !program.commands.some((c) => c.name() === process.argv[2]);
      if (rootExcess) {
        console.error(`Error: unknown command '${process.argv[2] as string}'`);
        process.exitCode = 2;
        return;
      }
      console.error(`Error: ${stripCommanderPrefix(commanderMsg)}`);
      process.exitCode = 2;
      return;
    }

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

    // predecessor parity: expected domain errors surface as a single `Error: <message>`
    // line on stderr with exit code 1 (no Bun stack trace).
    const message = stripCommanderPrefix(error instanceof Error ? error.message : String(error));
    console.error(message.startsWith('Error: ') ? message : `Error: ${message}`);
    process.exitCode = 1;
  }
}

/**
 * r107 execution guard with the Node 24.0/24.1 fallback: `import.meta.main`
 * is undefined there (introduced in v24.2.0), so a bare check would silently
 * skip every invocation. The fallback compares the realpath-normalized
 * `process.argv[1]` against this module's path — argv may be missing and the
 * realpath may fail, both fold to "not the entry".
 */
const isEntry =
  import.meta.main ??
  (() => {
    try {
      const invoked = process.argv[1];
      if (invoked === undefined) return false;
      return realpathSync(invoked) === realpathSync(import.meta.filename);
    } catch {
      return false;
    }
  })();

if (isEntry) await main();
