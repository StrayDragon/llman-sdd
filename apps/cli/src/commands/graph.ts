import { graphMermaid } from '@llman-sdd/core';
import type { Command } from 'commander';

import { cliMaxScanDepth, CliError, newIo } from '../cli-shared.ts';

export function registerGraph(program: Command): void {
  program
    .command('graph')
    .description('Generate a change dependency graph (mermaid)')
    .argument('[change]', 'seed change id (BFS over depends_on)')
    .option('--format <format>', 'output format', 'mermaid')
    .option('--scope <scope>', 'active | archived | all (comma-combined)', 'active')
    .option('--depth <n>', 'seed BFS depth (default: 1)')
    .action(
      (change: string | undefined, options: { format: string; scope?: string; depth?: string }) => {
        if (options.format !== 'mermaid') {
          throw new CliError(`unsupported --format: ${options.format} (mermaid only)`, 2);
        }
        const depth = options.depth !== undefined ? Number(options.depth) : undefined;
        if (depth !== undefined && (!Number.isInteger(depth) || depth < 0)) {
          throw new CliError(`invalid --depth: ${options.depth}`);
        }
        const graphOpts = {
          scope: options.scope,
          depth: depth ?? 1,
          seed: change,
          maxScanDepth: cliMaxScanDepth(program),
        };
        console.log(graphMermaid(newIo(), process.cwd(), graphOpts).join('\n'));
      },
    );
}
