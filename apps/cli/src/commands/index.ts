import { checkIndexFreshness, rebuildIndex, renderMachine } from '@llman-sdd/core';
import type { Command } from 'commander';

import { loadSpecEntries, newIo, resolveBackend, resolveOutMode } from '../cli-shared.ts';

export function registerIndex(program: Command): void {
  const indexCmd = program
    .command('index')
    .description('Index management commands (rebuild, check freshness)');

  indexCmd
    .command('rebuild')
    .description('Rebuild the pageindex tree from spec IR (no LLM)')
    .option('--backend <name>', 'index backend (pageindex only)')
    .action((options: { backend?: string }) => {
      resolveBackend(options.backend);
      const result = rebuildIndex(newIo(), 'llmanspec/specs', loadSpecEntries(), {
        chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
      });
      for (const line of result.lines.slice(0, -1)) console.error(line);
      if (result.lines.length > 0) console.log(result.lines.at(-1));
    });

  indexCmd
    .command('check')
    .description('Check index freshness without rebuilding')
    .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
    .action((options: { output?: string }) => {
      const result = checkIndexFreshness(newIo(), 'llmanspec/specs');
      const mode = resolveOutMode(options.output, undefined, undefined);
      if (mode === null) return;
      if (mode !== 'human') {
        console.log(renderMachine({ fresh: result.fresh, notes: result.lines }, mode));
      } else {
        for (const line of result.lines) console.log(line);
      }
      if (!result.fresh) process.exitCode = 1;
    });
}
