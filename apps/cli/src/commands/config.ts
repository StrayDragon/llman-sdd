import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderConfigOverview, skillsJson } from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  addSpecDirOption,
  emitReport,
  resolveCommandRoot,
  skillDesc,
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

  const skills = configCmd.command('skills').description('Manage extra_skills (non-interactive)');
  addReportOutputOptions(skills);
  addSpecDirOption(skills);
  skills.action(
    (options: { json?: boolean; output?: string; compactJson?: boolean; directory?: string }) => {
      const root = resolveCommandRoot(ctx, options.directory);
      const path = join(root, 'llmanspec', 'config.yaml');
      const source = readFileSync(path, 'utf8');
      warnLegacyBddOnce(source);
      const info = skillsJson(source);
      emitReport(info, options, () => {
        const { enabled, available } = info;
        const lines: string[] = ['Enabled optional skills:'];
        if (enabled.length === 0) lines.push('  (none)');
        else for (const s of enabled) lines.push(`  [x] ${s}`);
        lines.push('');
        lines.push('Available but not enabled:');
        for (const s of available) {
          if (!enabled.includes(s)) lines.push(`  [ ] ${s} — ${skillDesc(s)}`);
        }
        return lines.join('\n');
      });
    },
  );
}
