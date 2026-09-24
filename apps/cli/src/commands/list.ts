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
  CliError,
  assertCompactJsonPairing,
  addReportOutputOptions,
  cliMaxScanDepth,
  loadSpecEntries,
  newIo,
  resolveOutMode,
} from '../cli-shared.ts';

export function registerList(program: Command): void {
  const list = program
    .command('list')
    .description('List changes or specs')
    .option('--specs', 'list specs instead of changes')
    .option('--sort <order>', 'recent (mtime desc, default) | name');
  addReportOutputOptions(list);
  list.action(
    (options: {
      specs?: boolean;
      json?: boolean;
      compactJson?: boolean;
      output?: string;
      sort?: string;
    }) => {
      if (!assertCompactJsonPairing(options)) return;
      if (options.sort !== undefined && options.sort !== 'recent' && options.sort !== 'name') {
        throw new CliError(`invalid --sort: ${options.sort}`);
      }
      const emit = (text: string): void => {
        console.log(options.compactJson ? text.replaceAll('\n', '') : text);
      };
      if (options.specs) {
        const summaries = collectSpecs(loadSpecEntries());
        const specsMode = resolveOutMode(options.output, options.json, options.compactJson);
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
          return changesMode !== 'human'
            ? renderChangesJson(changes, changesMode)
            : renderChangesList(changes, new Date()).join('\n');
        })(),
      );
    },
  );
}
