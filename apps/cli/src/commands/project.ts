import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildReqRegistry,
  findMigration,
  isValidMigrationExpr,
  migrateNoteFor,
  migrateOverviewFor,
  migrationOverviewLines,
  migrationPrompt,
  knownMigrationIds,
  planDedupe,
  stripLegacyHeaderLines,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import { CliError, loadCliConfig, loadSpecEntries, newIo } from '../cli-shared.ts';

function collectFeatureFiles(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string): void => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const e of readdirSync(p)) walk(join(p, e));
    } else if (p.endsWith('.feature')) out.push(p);
  };
  for (const p of paths) {
    if (existsSync(p)) walk(p);
  }
  return out;
}

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
    .description(
      'Migration hub: legacy collaboration notes, versioned agent playbooks, spec-header strip',
    )
    .argument('[action]', 'prompt | strip-legacy-headers')
    .option('--kind <kind>', 'legacy collaboration notes: toon2features | specs-flatten')
    .option('--version-expr <expr>', "migration playbook selector, e.g. '0.7.5->0.8.0'")
    .option('--dry-run', 'strip-legacy-headers: report affected files without writing')
    .action(
      (
        action: string | undefined,
        options: { kind?: string; versionExpr?: string; dryRun?: boolean },
      ) => {
        const locale = loadCliConfig()?.locale ?? 'en';
        if (action === 'prompt') {
          const expr = options.versionExpr;
          if (expr === undefined) {
            console.log(
              [
                'Migration playbook selector is required.',
                `Known migrations: ${knownMigrationIds().join(', ')}`,
                "Usage: llman-sdd project migrate prompt --version-expr '<from>-><to>'",
              ].join('\n'),
            );
            return;
          }
          if (!isValidMigrationExpr(expr)) {
            throw new CliError(
              `invalid --version-expr: ${expr} (expected '<from>-><to>', e.g. '0.7.5->0.8.0')`,
            );
          }
          const migration = findMigration(expr);
          if (migration === null) {
            throw new CliError(
              `unknown migration: ${expr} (known: ${knownMigrationIds().join(', ')})`,
            );
          }
          console.log(migrationPrompt(migration));
          return;
        }
        if (action === 'strip-legacy-headers') {
          if (options.kind !== undefined || options.versionExpr !== undefined) {
            throw new CliError('strip-legacy-headers takes no --kind/--version-expr');
          }
          const targets = collectFeatureFiles(['llmanspec/specs']);
          let touched = 0;
          let removed = 0;
          for (const file of targets) {
            const source = readFileSync(file, 'utf8');
            const result = stripLegacyHeaderLines(source);
            if (result.removed === 0) continue;
            touched++;
            removed += result.removed;
            console.log(
              `[strip] ${file}: ${result.removed} line(s)${options.dryRun === true ? ' (dry-run)' : ''}`,
            );
            if (options.dryRun !== true) writeFileSync(file, result.content, 'utf8');
          }
          const mode = options.dryRun === true ? ' (dry-run)' : '';
          console.log(
            `strip-legacy-headers: ${touched} file(s), ${removed} line(s) removed${mode}`,
          );
          console.log('next: re-run `llman-sdd init --update` to refresh skills and templates');
          return;
        }
        if (action !== undefined) {
          throw new CliError(
            `unknown migrate action: ${action} (expected: prompt | strip-legacy-headers)`,
          );
        }
        if (options.kind === undefined) {
          console.log(migrateOverviewFor(locale));
          console.log(migrationOverviewLines().join('\n'));
          return;
        }
        const note = migrateNoteFor(options.kind, locale);
        if (note === null) {
          throw new CliError(
            `unknown migration kind: ${options.kind} (expected: toon2features | specs-flatten)`,
          );
        }
        console.log(note);
      },
    );
}
