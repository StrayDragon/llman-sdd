import { buildReqRegistry, migrateNoteFor, migrateOverviewFor, planDedupe } from '@llman-sdd/core';
import type { Command } from 'commander';

import { CliError, loadCliConfig, loadSpecEntries, newIo } from '../cli-shared.ts';

export function registerProject(program: Command): void {
  const project = program.command('project').description('Project management commands');

  project
    .command('dedupe-req-ids')
    .description('Remap globally duplicated req ids (report with --dry-run)')
    .option('--dry-run', 'report the remap plan without writing')
    .action((options: { dryRun?: boolean }) => {
      // dedupe registry covers requirement handles (`@req` on 规则: headers) only;
      // duplicates follow the occurrence model (同文件内共用或跨文件均算)
      const entries = loadSpecEntries();
      const { duplicates } = buildReqRegistry(entries);
      if (duplicates.length === 0) {
        console.log('No colliding req_id values in llmanspec/specs.');
        return;
      }
      const io = newIo();
      // r43: --dry-run is zero-side-effect — plan only, never write.
      const plan = planDedupe(entries, io, 'llmanspec/specs', duplicates, {
        apply: !options.dryRun,
      });
      // predecessor output: `{cap}: {from} → {to}` per remap (prefix in dry-run) + count line.
      for (const item of plan) {
        const cap = item.remapFile.replace(/^.*specs\//u, '').replace(/\.feature$/u, '');
        const prefix = options.dryRun ? '[dry-run] ' : '';
        console.log(`${prefix}${cap}: ${item.reqId} → ${item.newReqId}`);
      }
      console.log(`${plan.length} remapping(s)${options.dryRun ? ' (dry-run)' : ''}`);
    });

  project
    .command('migrate')
    .description('Legacy migration collaboration notes (prints guidance; performs no migration)')
    .option('--kind <kind>', 'collaboration notes: toon2features | specs-flatten')
    .action((options: { kind?: string }) => {
      const locale = loadCliConfig()?.locale ?? 'en';
      if (options.kind === undefined) {
        console.log(migrateOverviewFor(locale));
        return;
      }
      const note = migrateNoteFor(options.kind, locale);
      if (note === null) {
        throw new CliError(
          `unknown migration kind: ${options.kind} (expected: toon2features | specs-flatten)`,
        );
      }
      console.log(note);
    });
}
