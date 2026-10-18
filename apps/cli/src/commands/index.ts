import { join } from 'node:path';

import { checkIndexFreshness, discoverSpecs, rebuildIndex } from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  addSpecDirOption,
  emitReport,
  exitWith,
  resolveCommandRoot,
  resolveBackend,
  type CliContext,
} from '../cli-shared.ts';

export function registerIndex(program: Command, ctx: CliContext): void {
  const indexCmd = program
    .command('index')
    .description('Index management commands (rebuild, check freshness)');

  indexCmd
    .command('rebuild')
    .description('Rebuild the pageindex tree from spec IR (no LLM)')
    .option('--backend <name>', 'index backend (pageindex only)')
    .action((options: { backend?: string; directory?: string }) => {
      resolveBackend(options.backend);
      const root = resolveCommandRoot(ctx, options.directory);
      const result = rebuildIndex(
        ctx.io,
        join(root, 'llmanspec', 'specs'),
        discoverSpecs(join(root, 'llmanspec', 'specs'), ctx.io),
        {
          chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
        },
      );
      for (const line of result.lines.slice(0, -1)) console.error(line);
      if (result.lines.length > 0) console.log(result.lines.at(-1));
    });

  const check = indexCmd.command('check').description('Check index freshness without rebuilding');
  addReportOutputOptions(check);
  addSpecDirOption(check);
  check.action(
    (options: { output?: string; json?: boolean; compactJson?: boolean; directory?: string }) => {
      const root = resolveCommandRoot(ctx, options.directory);
      const result = checkIndexFreshness(ctx.io, join(root, 'llmanspec', 'specs'));
      emitReport({ fresh: result.fresh, notes: result.lines }, options, () =>
        result.lines.join('\n'),
      );
      if (!result.fresh) exitWith(1);
    },
  );
}
