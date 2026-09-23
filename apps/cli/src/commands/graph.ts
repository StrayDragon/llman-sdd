import { graphData, graphMermaid, renderMachine } from '@llman-sdd/core';
import type { Command } from 'commander';

import { newIo } from '../cli-shared.ts';

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
        if (
          options.format !== 'mermaid' &&
          options.format !== 'json' &&
          options.format !== 'toon'
        ) {
          process.exitCode = 1;
          throw new Error(
            `Unsupported format: ${options.format}. Supported: mermaid | json | toon`,
          );
        }
        const depth = options.depth !== undefined ? Number(options.depth) : undefined;
        if (depth !== undefined && (!Number.isInteger(depth) || depth < 0)) {
          console.error(`invalid --depth: ${options.depth}`);
          process.exitCode = 1;
          return;
        }
        const graphOpts = {
          scope: options.scope,
          depth: depth ?? 1,
          seed: change,
        };
        if (options.format === 'mermaid') {
          console.log(graphMermaid(newIo(), process.cwd(), graphOpts).join('\n'));
        } else {
          console.log(renderMachine(graphData(newIo(), process.cwd(), graphOpts), options.format));
        }
      },
    );
}
