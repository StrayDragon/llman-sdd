import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { makeWasmSevenZip, runFreeze, runList, runThaw } from '@llman-sdd/core';
import type { Command } from 'commander';

import { makeIo } from '../io.ts';

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
          const sz = await makeWasmSevenZip();
          const root = process.cwd();
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
      const sz = await makeWasmSevenZip();
      const root = process.cwd();
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
