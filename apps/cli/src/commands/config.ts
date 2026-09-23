import { readFileSync } from 'node:fs';

import { renderConfigOverview, renderMachine, skillsJson } from '@llman-sdd/core';
import type { Command } from 'commander';

import { resolveOutMode, skillDesc } from '../cli-shared.ts';

export function registerConfig(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Project configuration commands (view/edit config.yaml)');

  configCmd.description('Print a read-only llmanspec/config.yaml overview').action(() => {
    const source = readFileSync('llmanspec/config.yaml', 'utf8');
    console.log(renderConfigOverview(source).join('\n'));
  });

  configCmd
    .command('skills')
    .description('Manage extra_skills (non-interactive)')
    .option('--json', 'emit {enabled, available}')
    .option('--no-interactive', 'print state instead of launching the interactive picker')
    .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
    .action((options: { json?: boolean; output?: string; interactive?: boolean }) => {
      const path = 'llmanspec/config.yaml';
      const info = skillsJson(readFileSync(path, 'utf8'));
      const mode = resolveOutMode(options.output, options.json, false);
      if (mode === null) return;
      if (mode !== 'human') {
        console.log(renderMachine(info, mode));
        return;
      }
      const enabled = info.enabled;
      const available = info.available;
      console.log('Enabled optional skills:');
      if (enabled.length === 0) console.log('  (none)');
      else for (const s of enabled) console.log(`  [x] ${s}`);
      console.log();
      console.log('Available but not enabled:');
      for (const s of available) {
        if (!enabled.includes(s)) console.log(`  [ ] ${s} — ${skillDesc(s)}`);
      }
      console.log();
      console.log('(Run without --no-interactive to edit interactively.)');
    });
}
