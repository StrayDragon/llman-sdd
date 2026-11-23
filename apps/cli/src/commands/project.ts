import {
  ARCHIVE_DIR_REL,
  DEFAULT_LOCALE,
  buildReqRegistry,
  compareVersions,
  isValidVersion,
  migrateOverviewFor,
  migrationOverviewLines,
  migrationPrompt,
  knownMigrationVersions,
  planDedupe,
  planUnfenceLegacyCards,
  unfenceLegacyCards,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  CliError,
  addSpecDirOption,
  loadCliConfig,
  loadRootSpecEntries,
  reRootContext,
  type CliContext,
  resolveRootSpecsDir,
} from '../cli-shared.ts';

interface MigrateOptions {
  fromVersion?: string;
  toVersion?: string;
  dryRun?: boolean;
  directory?: string;
}

/** Resolve the playbook range from --from-version/--to-version. */
function resolvePromptRange(options: MigrateOptions): { from: string; to: string } | null {
  const hasNew = options.fromVersion !== undefined || options.toVersion !== undefined;
  if (!hasNew) return null;
  if (options.fromVersion === undefined || options.toVersion === undefined) {
    throw new CliError('--from-version and --to-version must be given together (x.y.z)', 2);
  }
  return { from: options.fromVersion, to: options.toVersion };
}

export function registerProject(program: Command, ctx: CliContext): void {
  const project = program.command('project').description('Project management commands');

  const dedupe = project
    .command('dedupe-req-ids')
    .description('Remap globally duplicated req ids (report with --dry-run)')
    .option('--dry-run', 'report the remap plan without writing')
    .action((options: { dryRun?: boolean; directory?: string }) => {
      // dedupe registry covers requirement handles (`@req` on 规则: headers) only;
      // duplicates follow the occurrence model (同文件内共用或跨文件均算)
      // r115: the instance root (--directory, else the nearest at or above cwd)
      // scopes the registry AND the write plan — never the launch dir alone.
      const entries = loadRootSpecEntries(options.directory, ctx.io);
      const { duplicates } = buildReqRegistry(entries);
      if (duplicates.length === 0) {
        console.log('No colliding req_id values in llmanspec/specs.');
        return;
      }
      const io = ctx.io;
      // r43: --dry-run is zero-side-effect — plan only, never write.
      const plan = planDedupe(
        entries,
        io,
        resolveRootSpecsDir(options.directory, ctx.io),
        duplicates,
        {
          apply: !options.dryRun,
        },
      );
      // predecessor output: `{cap}: {from} → {to}` per remap (prefix in dry-run) + count line.
      for (const item of plan) {
        const cap = item.remapFile.replace(/^.*specs\//u, '').replace(/\.feature$/u, '');
        const prefix = options.dryRun ? '[dry-run] ' : '';
        console.log(`${prefix}${cap}: ${item.reqId} → ${item.newReqId}`);
      }
      console.log(`${plan.length} remapping(s)${options.dryRun ? ' (dry-run)' : ''}`);
    });
  addSpecDirOption(dedupe);

  const migrate = project
    .command('migrate')
    .description('Migration hub: versioned agent playbooks and frozen-card unfence')
    .argument('[action]', 'prompt | frozen-cards-unfence')
    .option('--from-version <version>', 'migration playbook range start, exclusive (x.y.z)')
    .option('--to-version <version>', 'migration playbook range end, inclusive (x.y.z)')
    .option('--dry-run', 'frozen-cards-unfence: report without writing')
    .action((action: string | undefined, options: MigrateOptions) => {
      if (
        action === undefined &&
        (options.fromVersion !== undefined || options.toVersion !== undefined)
      ) {
        throw new CliError(
          'project migrate range flags require the prompt action (llman-sdd project migrate prompt)',
          2,
        );
      }
      const locale = loadCliConfig()?.locale ?? DEFAULT_LOCALE;
      if (action === 'prompt') {
        const range = resolvePromptRange(options);
        if (range === null) {
          console.log(
            [
              'Migration playbook range is required.',
              `Known migrations: ${knownMigrationVersions().join(', ')}`,
              'Usage: llman-sdd project migrate prompt --from-version <from> --to-version <to>',
            ].join('\n'),
          );
          return;
        }
        for (const v of [range.from, range.to]) {
          if (!isValidVersion(v)) {
            throw new CliError(
              `invalid version '${v}': expected x.y.z (e.g. 0.9.0), got '${v}'`,
              2,
            );
          }
        }
        if (compareVersions(range.from, range.to) >= 0) {
          throw new CliError(
            `invalid range: --from-version (${range.from}) must be less than --to-version (${range.to})`,
            2,
          );
        }
        console.log(migrationPrompt(range.from, range.to));
        return;
      }
      if (action === 'frozen-cards-unfence') {
        if (options.fromVersion !== undefined || options.toVersion !== undefined) {
          throw new CliError('frozen-cards-unfence takes no --from-version/--to-version');
        }
        const rctx = reRootContext(ctx, options.directory);
        if (options.dryRun === true) {
          const hits = planUnfenceLegacyCards(rctx.io, ARCHIVE_DIR_REL);
          for (const rel of hits) console.log(`[unfence] ${rel} (dry-run)`);
          console.log(`frozen-cards-unfence: ${hits.length} card(s) would change (dry-run)`);
          return;
        }
        const changed = unfenceLegacyCards(rctx.io, ARCHIVE_DIR_REL);
        console.log(`frozen-cards-unfence: ${changed} card(s) normalized to single-document YAML`);
        return;
      }
      if (action !== undefined) {
        throw new CliError(
          `unknown migrate action: ${action} (expected: prompt | frozen-cards-unfence)`,
          2,
        );
      }
      console.log(migrateOverviewFor(locale));
      console.log(migrationOverviewLines().join('\n'));
    });
  addSpecDirOption(migrate);
}
