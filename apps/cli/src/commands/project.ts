import { migrateNoteFor, migrateOverviewFor, planDedupe } from '@llman-sdd/core';
import type { Command } from 'commander';

import { loadCliConfig, loadSpecEntries, newIo } from '../cli-shared.ts';

export function registerProject(program: Command): void {
  const project = program.command('project').description('Project management commands');

  project
    .command('dedupe-req-ids')
    .description('Remap globally duplicated req ids (report with --dry-run)')
    .option('--dry-run', 'report the remap plan without writing')
    .action((options: { dryRun?: boolean }) => {
      // v1 parity: dedupe registry covers @human (rule) req ids only.
      const entries = loadSpecEntries();
      const owners = new Map<string, string[]>();
      for (const e of entries) {
        for (const sc of e.doc.scenarios) {
          if (sc.classification !== 'human') continue;
          for (const rid of sc.reqIds) {
            const list = owners.get(rid) ?? [];
            if (!list.includes(e.fileName)) list.push(e.fileName);
            owners.set(rid, list);
          }
        }
      }
      const duplicates = [...owners.entries()]
        .filter(([, files]) => files.length > 1)
        .map(([reqId, files]) => ({ reqId, files }));
      if (duplicates.length === 0) {
        console.log('No colliding req_id values in llmanspec/specs.');
        return;
      }
      const io = newIo();
      const plan = planDedupe(entries, io, 'llmanspec/specs', duplicates);
      // v1 output: `{cap}: {from} → {to}` per remap (prefix in dry-run) + count line.
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
        console.error(
          `unknown migration kind: ${options.kind} (expected: toon2features | specs-flatten)`,
        );
        process.exitCode = 1;
        return;
      }
      console.log(note);
    });
}
