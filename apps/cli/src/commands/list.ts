import { join } from 'node:path';

import {
  collectChanges,
  collectSpecs,
  renderChangesJson,
  renderChangesList,
  renderSpecsJson,
  renderSpecsList,
  discoverSpecs,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addSpecDirOption,
  CliError,
  assertCompactJsonPairing,
  addReportOutputOptions,
  cliMaxScanDepth,
  resolveCommandRoot,
  resolveOutMode,
  type CliContext,
} from '../cli-shared.ts';

export function registerList(program: Command, ctx: CliContext): void {
  const list = program
    .command('list')
    .description('List changes or specs')
    .option('--specs', 'list specs instead of changes')
    .option('--sort <order>', 'recent (mtime desc, default) | name');
  addReportOutputOptions(list);
  addSpecDirOption(list);
  list.action(
    (options: {
      specs?: boolean;
      json?: boolean;
      compactJson?: boolean;
      output?: string;
      sort?: string;
      directory?: string;
    }) => {
      assertCompactJsonPairing(options);
      if (options.sort !== undefined && options.sort !== 'recent' && options.sort !== 'name') {
        throw new CliError(`invalid --sort: ${options.sort}`, 2);
      }
      // T18/T30: shared pipeline; compact is the single-point minified
      // JSON.stringify (r76) — no per-command newline stripping.
      const mode = resolveOutMode(options.output, options.json, options.compactJson);
      const emit = (text: string): void => {
        console.log(text);
      };
      if (options.specs) {
        const root = resolveCommandRoot(ctx, options.directory);
        const summaries = collectSpecs(discoverSpecs(join(root, 'llmanspec', 'specs'), ctx.io));
        emit(
          mode === 'human'
            ? renderSpecsList(summaries).join('\n')
            : renderSpecsJson(summaries, mode),
        );
        return;
      }
      let changes = collectChanges(ctx.io, resolveCommandRoot(ctx, options.directory), new Date(), {
        maxScanDepth: cliMaxScanDepth(program),
      });
      if (options.sort === 'name') {
        changes = [...changes].toSorted((a, b) => a.name.localeCompare(b.name));
      }
      emit(
        mode === 'human'
          ? renderChangesList(changes, new Date()).join('\n')
          : renderChangesJson(changes, mode),
      );
    },
  );
}
