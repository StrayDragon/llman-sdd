import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderConfigOverview } from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addSpecDirOption,
  resolveCommandRoot,
  warnLegacyBddOnce,
  type CliContext,
} from '../cli-shared.ts';

export function registerConfig(program: Command, ctx: CliContext): void {
  const configCmd = program.command('config');

  configCmd.description('Print a read-only llmanspec/config.yaml overview');
  addSpecDirOption(configCmd);
  configCmd.action((options: { directory?: string }) => {
    const root = resolveCommandRoot(ctx, options.directory);
    const source = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
    warnLegacyBddOnce(source);
    console.log(renderConfigOverview(source).join('\n'));
  });
}
