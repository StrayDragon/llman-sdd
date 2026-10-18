import { join } from 'node:path';

import { checkIndexFreshness, discoverSpecs, rebuildIndex } from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  addSpecDirOption,
  emitReport,
  exitWith,
  reRootContext,
  resolveBackend,
  type CliContext,
} from '../cli-shared.ts';

export function registerIndex(program: Command, ctx: CliContext): void {
  const indexCmd = program
    .command('index')
    .description('Index management commands (rebuild, check freshness)');

  const rebuild = indexCmd
    .command('rebuild')
    .description('Rebuild the pageindex tree from spec IR (no LLM)')
    .option('--backend <name>', 'index backend (pageindex only)')
    .action((options: { backend?: string; directory?: string }) => {
      resolveBackend(options.backend);
      // r115/r116: resolve the instance root once and anchor io at it — the
      // pageindex store is written through root-relative paths, which must land
      // in the --directory instance rather than the launch directory.
      const rctx = reRootContext(ctx, options.directory);
      const specsDir = join(rctx.root, 'llmanspec', 'specs');
      const result = rebuildIndex(rctx.io, specsDir, discoverSpecs(specsDir, rctx.io), {
        chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
      });
      for (const line of result.lines.slice(0, -1)) console.error(line);
      if (result.lines.length > 0) console.log(result.lines.at(-1));
    });
  addSpecDirOption(rebuild);

  const check = indexCmd.command('check').description('Check index freshness without rebuilding');
  addReportOutputOptions(check);
  addSpecDirOption(check);
  check.action(
    (options: { output?: string; json?: boolean; compactJson?: boolean; directory?: string }) => {
      const rctx = reRootContext(ctx, options.directory);
      const result = checkIndexFreshness(rctx.io, join(rctx.root, 'llmanspec', 'specs'));
      emitReport({ fresh: result.fresh, notes: result.lines }, options, () =>
        result.lines.join('\n'),
      );
      if (!result.fresh) exitWith(1);
    },
  );
}
