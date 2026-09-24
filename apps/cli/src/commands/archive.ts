import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  nonMainCheckoutWarning,
  probeMainCheckout,
  runFreeze,
  runList,
  runThaw,
  makeWasmSevenZip,
  type SevenZipPort,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import { makeCliGit, makeIo } from '../io.ts';

/**
 * r24: warn (never block) when freeze/thaw runs outside the main checkout —
 * the worktree NOT holding the default branch. Probe failures skip silently.
 */
function warnIfNotMainCheckout(root: string): void {
  const warning = nonMainCheckoutWarning(probeMainCheckout(makeCliGit(root)));
  if (warning !== null) console.log(warning);
}

/**
 * Compiled binaries have no on-disk 7zz.wasm (Emscripten would probe $bunfs
 * and abort), so scripts/build-binary.ts injects it as base64 through the
 * literal define `process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64` (define only
 * rewrites literal member access — the read must stay here, not in core);
 * unset in source/npm/Node runs → the 7z-wasm glue loads the .wasm from disk.
 * Directory creation for extraction is likewise injected (core stays pure).
 */
function makeEmbeddedSevenZip(): Promise<SevenZipPort> {
  return makeWasmSevenZip({
    wasmB64: process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64,
    mkdirp: (dir) => mkdirSync(dir, { recursive: true }),
  });
}

export function registerArchive(program: Command): void {
  const archive = program
    .command('archive')
    .description(
      'Archive workflow commands (cold backup). Prefer `change finalize` to seal a change',
    );

  archive
    .command('freeze')
    .description('Freeze dated archived changes into a single 7z cold backup')
    .option('--before <date>', 'freeze entries older than this date (YYYY-MM-DD)')
    .option('--keep-recent <n>', 'keep N most recent candidates unfrozen', '0')
    .option('--dry-run', 'list candidates without freezing')
    .option('--list', 'list entries already in the cold-backup archive')
    .action(
      async (options: {
        before?: string;
        keepRecent: string;
        dryRun?: boolean;
        list?: boolean;
      }) => {
        try {
          const root = process.cwd();
          warnIfNotMainCheckout(root);
          const sz = await makeEmbeddedSevenZip();
          const io = makeIo(root);
          if (options.list) {
            for (const line of await runList(io, sz, root)) console.log(line);
            return;
          }
          const result = await runFreeze(io, sz, root, {
            before: options.before,
            keepRecent: Number(options.keepRecent),
            dryRun: options.dryRun,
          });
          for (const line of result.lines) console.log(line);
        } catch (error) {
          // Emscripten aborts (e.g. wasm load failure) throw raw RuntimeErrors —
          // keep the CLI surface one-line like thaw does.
          console.error((error as Error).message);
          process.exitCode = 1;
        }
      },
    );

  archive
    .command('thaw')
    .description('Restore archived change directories from the cold-backup archive')
    .requiredOption(
      '--change <name>',
      'archived change directory to restore (repeatable)',
      (v: string, prev: string[]) => {
        prev.push(v);
        return prev;
      },
      [] as string[],
    )
    .option('--dest <path>', 'restore into this directory (created when missing)')
    .action(async (options: { change: string[]; dest?: string }) => {
      if (options.dest !== undefined) {
        mkdirSync(resolve(options.dest), { recursive: true });
      }
      const root = process.cwd();
      warnIfNotMainCheckout(root);
      const sz = await makeEmbeddedSevenZip();
      const io = makeIo(root);
      try {
        const result = await runThaw(io, sz, root, options.change, { dest: options.dest });
        for (const line of result.lines) console.log(line);
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });
}
