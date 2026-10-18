import { graphMermaid } from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  cliMaxScanDepth,
  CliError,
  type CliContext,
  addSpecDirOption,
  resolveCommandRoot,
} from '../cli-shared.ts';

export function registerGraph(program: Command, ctx: CliContext): void {
  const graph = program
    .command('graph')
    .description('Generate a change dependency graph (mermaid)')
    .argument('[change]', 'seed change id (BFS over depends_on)')
    .option('--format <format>', 'output format', 'mermaid')
    .option('--scope <scope>', 'active | archived | all (comma-combined)', 'active')
    .option(
      '--depth <n>',
      'expansion depth: 0 = scope only, 1 = direct deps (default), N = recursive',
    );
  addSpecDirOption(graph);
  graph.action(
    (
      change: string | undefined,
      options: { format: string; scope?: string; depth?: string; directory?: string },
    ) => {
      if (options.format !== 'mermaid') {
        throw new CliError(`unsupported --format: ${options.format} (mermaid only)`, 2);
      }
      const depth = options.depth !== undefined ? Number(options.depth) : undefined;
      if (depth !== undefined && (!Number.isInteger(depth) || depth < 0)) {
        throw new CliError(`invalid --depth: ${options.depth}`, 2);
      }
      const graphOpts = {
        scope: options.scope,
        depth: depth ?? 1,
        seed: change,
        maxScanDepth: cliMaxScanDepth(program),
      };
      console.log(
        graphMermaid(ctx.io, resolveCommandRoot(ctx, options.directory), graphOpts).join('\n'),
      );
    },
  );
}
