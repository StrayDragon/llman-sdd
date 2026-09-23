import {
  collectChanges,
  collectSpecs,
  renderChangesJson,
  renderChangesList,
  renderSpecsJson,
  renderSpecsList,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  assertCompactJsonPairing,
  cliMaxScanDepth,
  loadSpecEntries,
  newIo,
  resolveOutMode,
} from '../cli-shared.ts';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List changes or specs')
    .option('--changes', 'list changes (v1 explicit scope flag; default)')
    .option('--specs', 'list specs instead of changes')
    .option('--json', 'machine-readable output')
    .option('--compact-json', 'single-line --json (requires --json)')
    .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
    .option('--sort <order>', 'recent (mtime desc, default) | name')
    .action(
      (options: {
        specs?: boolean;
        json?: boolean;
        compactJson?: boolean;
        output?: string;
        sort?: string;
      }) => {
        if (!assertCompactJsonPairing(options)) return;
        if (options.sort !== undefined && options.sort !== 'recent' && options.sort !== 'name') {
          console.error(`invalid --sort: ${options.sort}`);
          process.exitCode = 1;
          return;
        }
        const emit = (text: string): void => {
          console.log(options.compactJson ? text.replaceAll('\n', '') : text);
        };
        if (options.specs) {
          const summaries = collectSpecs(loadSpecEntries());
          const specsMode = resolveOutMode(options.output, options.json, options.compactJson);
          if (specsMode === null) return;
          emit(
            specsMode !== 'human'
              ? renderSpecsJson(summaries, specsMode)
              : renderSpecsList(summaries).join('\n'),
          );
          return;
        }
        let changes = collectChanges(newIo(), process.cwd(), new Date(), {
          maxScanDepth: cliMaxScanDepth(program),
        });
        if (options.sort === 'name') {
          changes = [...changes].toSorted((a, b) => a.name.localeCompare(b.name));
        }
        emit(
          (() => {
            const changesMode = resolveOutMode(options.output, options.json, options.compactJson);
            if (changesMode === null) return '';
            return changesMode !== 'human'
              ? renderChangesJson(changes, changesMode)
              : renderChangesList(changes, new Date()).join('\n');
          })(),
        );
      },
    );
}
