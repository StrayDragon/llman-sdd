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

import { addSpecDirOption, reRootContext, type CliContext } from '../cli-shared.ts';
import { makeCliGit } from '../io.ts';
import { progressNote } from '../progress.ts';

/**
 * r24: warn (never block) when freeze/thaw runs outside the main checkout —
 * the worktree NOT holding the default branch. Probe failures skip silently.
 */
function warnIfNotMainCheckout(git: ReturnType<typeof makeCliGit>): void {
  const warning = nonMainCheckoutWarning(probeMainCheckout(git));
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

export function registerArchive(program: Command, ctx: CliContext): void {
  const archive = program
    .command('archive')
    .description(
      'Archive workflow commands (cold backup). Seal a change with `llman-sdd change finalize` first',
    );

  const freeze = archive
    .command('freeze')
    .description('Freeze dated archived changes into a single 7z cold backup')
    .option('--before <date>', 'freeze entries older than this date (YYYY-MM-DD)')
    .option('--keep-recent <n>', 'keep N most recent candidates unfrozen', '0')
    .option('--dry-run', 'list candidates without freezing')
    .option('--list', 'list entries already in the cold-backup archive')
    .option(
      '--ignore-file <path>',
      'extra gitignore-format file excluding archive entries (repeatable)',
      (v: string, prev: string[]) => {
        prev.push(v);
        return prev;
      },
      [] as string[],
    );
  addSpecDirOption(freeze);
  freeze.action(
    async (options: {
      before?: string;
      keepRecent: string;
      dryRun?: boolean;
      list?: boolean;
      ignoreFile: string[];
      directory?: string;
    }) => {
      // r118: the cold-backup reads and writes stay inside the resolved
      // instance root (`llmanspec/changes/archive`), never the launch cwd.
      const rctx = reRootContext(ctx, options.directory);
      const root = rctx.root;
      warnIfNotMainCheckout(ctx.git);
      const sz = await makeEmbeddedSevenZip();
      const io = rctx.io;
      if (options.list) {
        for (const line of await runList(io, sz, root)) console.log(line);
        return;
      }
      // 7z 压缩可能耗时 — 进度提示防止看上去卡住(B1);dry-run/list 不走压缩
      if (!options.dryRun) progressNote('freeze.pack', root);
      const result = await runFreeze(io, sz, root, {
        before: options.before,
        keepRecent: Number(options.keepRecent),
        dryRun: options.dryRun,
        // r116 exemption: user-supplied paths keep their cwd-literal meaning.
        ignoreFiles: options.ignoreFile.map((p) => resolve(p)),
      });
      for (const line of result.lines) console.log(line);
    },
  );

  const thaw = archive
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
    .option('--dest <path>', 'restore into this directory (created when missing)');
  addSpecDirOption(thaw);
  thaw.action(async (options: { change: string[]; dest?: string; directory?: string }) => {
    const rctx = reRootContext(ctx, options.directory);
    if (options.dest !== undefined) {
      mkdirSync(resolve(options.dest), { recursive: true });
    }
    const root = rctx.root;
    warnIfNotMainCheckout(ctx.git);
    const sz = await makeEmbeddedSevenZip();
    const io = rctx.io;
    // r116 exemption: `--dest` is a user-supplied path and keeps its
    // cwd-literal meaning. Core resolves it against the (possibly re-rooted)
    // instance io, so hand it over already made absolute — single-root
    // invocations keep the literal spelling untouched.
    const dest =
      options.dest === undefined || rctx.root === ctx.root ? options.dest : resolve(options.dest);
    // 7z 解包可能耗时 — 进度提示防止看上去卡住(B1)
    progressNote('thaw.unpack', root);
    const result = await runThaw(io, sz, root, options.change, { dest });
    for (const line of result.lines) console.log(line);
  });
}
