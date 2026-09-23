import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runInit } from '@llman-sdd/core';
import type { Command } from 'commander';

import { templateIo, version } from '../cli-shared.ts';
import { makeIo } from '../io.ts';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize llmanspec in your project (--update to refresh existing)')
    .argument('[path]', 'target directory (created when missing; defaults to cwd)')
    .option('--update', 'refresh an existing installation')
    .option('--locale <locale>', 'locale for generated templates (defaults to config or en)')
    .option('--lang <locale>', 'alias of --locale')
    .action(
      (path: string | undefined, options: { update?: boolean; locale?: string; lang?: string }) => {
        if (options.locale !== undefined && options.lang !== undefined) {
          console.error('--locale and --lang are mutually exclusive (they are aliases)');
          process.exitCode = 1;
          return;
        }
        let root = process.cwd();
        if (path !== undefined) {
          root = resolve(path);
          mkdirSync(root, { recursive: true });
        }
        const result = runInit(makeIo(root), templateIo, {
          update: options.update ?? false,
          locale: options.locale ?? options.lang,
          version,
        });
        const removed = result.removed.length > 0 ? `, removed: ${result.removed.join(', ')}` : '';
        console.log(`initialized llmanspec (${result.skills.length} skills${removed})`);
      },
    );
}
