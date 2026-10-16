import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  discoverRoots,
  isValidRoot,
  refreshSubRootBlocks,
  resolveInstanceRoot,
  runInit,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import { CliError, templateIo, version } from '../cli-shared.ts';
import { makeCliGit, makeIo } from '../io.ts';
import { progressNote } from '../progress.ts';

/**
 * r93: the repo-root instance (git toplevel, or outside any repo) carries the
 * agent skill surface; a sub-root init defaults to blocks-only. `--skills`
 * opts a sub-root in.
 */
function isRepoRootInstance(root: string): boolean {
  const toplevel = makeCliGit(root).runOpt(['rev-parse', '--show-toplevel']);
  return toplevel === null || resolve(toplevel) === root;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize llmanspec in your project (--update to refresh existing)')
    .argument('[path]', 'target directory (created when missing; defaults to cwd)')
    .option('--update', 'refresh an existing installation')
    .option(
      '--skills',
      'inject .agents/skills at a sub-root instance (repo-root instances always inject)',
    )
    .option(
      '--locale <locale>',
      'locale for generated templates (explicit config.yaml locale wins; fills a missing key; built-in default en)',
    )
    .option('--lang <locale>', 'alias of --locale')
    .action(
      (
        path: string | undefined,
        options: { update?: boolean; skills?: boolean; locale?: string; lang?: string },
      ) => {
        if (options.locale !== undefined && options.lang !== undefined) {
          throw new CliError('--locale and --lang are mutually exclusive (they are aliases)');
        }
        let root = process.cwd();
        if (path !== undefined) {
          root = resolve(path);
          mkdirSync(root, { recursive: true });
        }
        const io = makeIo(root);
        const warn = (message: string): void => {
          console.error(message);
        };
        // r106 new-instance notice: creating a fresh instance below an existing
        // one is legal (r93 逐根构造) but usually a cwd mistake — surface both.
        if (!isValidRoot(join(root, 'llmanspec'), io)) {
          const ancestor = resolveInstanceRoot(root, io);
          if (ancestor !== null) {
            warn(
              `WARNING: no llman-sdd instance at ${root}; creating a new one (nearest existing instance: ${ancestor})`,
            );
          }
        }
        const repoRootInstance = isRepoRootInstance(root);
        // 模板生成/子根扫块可能耗时 — 进度提示防止看上去卡住(B1)
        progressNote('init.generate', root);
        const result = runInit(io, templateIo, {
          update: options.update ?? false,
          locale: options.locale ?? options.lang,
          version,
          skills: options.skills === true || repoRootInstance,
          onWarning: warn,
        });
        let swept = '';
        if (options.update ?? false) {
          // r93 --update sweep, per-workspace from any instance root: refresh
          // managed blocks of every root discovered from the repo toplevel
          // (outside a repo: from the target). Blocks only; skills stay a
          // repo-root surface.
          const toplevel = makeCliGit(root).runOpt(['rev-parse', '--show-toplevel']);
          const sweepStart = toplevel !== null ? resolve(toplevel) : root;
          const subRoots = discoverRoots(sweepStart, makeIo(sweepStart)).filter(
            (r) => r.rootDir !== root,
          );
          const refreshed: string[] = [];
          for (const sub of subRoots) {
            if (refreshSubRootBlocks(makeIo(sub.rootDir), templateIo, version, warn)) {
              refreshed.push(sub.rootDir);
            }
          }
          if (refreshed.length > 0) swept = `, blocks refreshed: ${refreshed.join(', ')}`;
        }
        const removed = result.removed.length > 0 ? `, removed: ${result.removed.join(', ')}` : '';
        console.log(`initialized llmanspec (${result.skills.length} skills${removed}${swept})`);
      },
    );
}
