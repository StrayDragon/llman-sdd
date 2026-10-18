import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_LOCALE,
  buildReqRegistry,
  compareVersions,
  isValidVersion,
  migrateNoteFor,
  migrateOverviewFor,
  migrationOverviewLines,
  migrationPrompt,
  knownMigrationVersions,
  parseVersionExpr,
  planDedupe,
  stripLegacyHeaderLines,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  CliError,
  addSpecDirOption,
  loadCliConfig,
  loadRootSpecEntries,
  type CliContext,
  resolveRootSpecsDir,
} from '../cli-shared.ts';

interface MigrateOptions {
  kind?: string;
  fromVersion?: string;
  toVersion?: string;
  versionExpr?: string;
  dryRun?: boolean;
  directory?: string;
}

/** Resolve the playbook range from --from-version/--to-version or the
 * deprecated --version-expr (r100): conflict → ERROR, missing half → ERROR,
 * malformed version → ERROR, from >= to → ERROR. Returns null when no
 * selector was given at all (caller prints usage). */
function resolvePromptRange(options: MigrateOptions): {
  from: string;
  to: string;
  viaExpr: boolean;
} | null {
  const hasNew = options.fromVersion !== undefined || options.toVersion !== undefined;
  if (options.versionExpr !== undefined && hasNew) {
    throw new CliError(
      '--version-expr is deprecated and conflicts with --from-version/--to-version; pass only the new flags',
      2,
    );
  }
  if (options.versionExpr !== undefined) {
    const parsed = parseVersionExpr(options.versionExpr);
    if (parsed === null) {
      throw new CliError(
        `invalid --version-expr: ${options.versionExpr} (expected '<from>-><to>', e.g. '0.7.5->0.8.0')`,
        2,
      );
    }
    return { ...parsed, viaExpr: true };
  }
  if (!hasNew) return null;
  if (options.fromVersion === undefined || options.toVersion === undefined) {
    throw new CliError('--from-version and --to-version must be given together (x.y.z)', 2);
  }
  return { from: options.fromVersion, to: options.toVersion, viaExpr: false };
}

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
    .description(
      'Migration hub: legacy collaboration notes, versioned agent playbooks, spec-header strip',
    )
    .argument('[action]', 'prompt | strip-legacy-headers')
    .option('--kind <kind>', 'legacy collaboration notes: toon2features | specs-flatten')
    .option('--from-version <version>', 'migration playbook range start, exclusive (x.y.z)')
    .option('--to-version <version>', 'migration playbook range end, inclusive (x.y.z)')
    .option(
      '--version-expr <expr>',
      "deprecated — use --from-version/--to-version instead (e.g. '0.7.5->0.8.0')",
    )
    .option('--dry-run', 'strip-legacy-headers: report affected files without writing')
    .action((action: string | undefined, options: MigrateOptions) => {
      // T36: version-range flags without an action are a usage error (rc 2),
      // not a silent no-op — the error names the action that consumes them.
      // `--kind` alone stays the legacy no-action form (overview / kind note).
      if (
        action === undefined &&
        (options.versionExpr !== undefined ||
          options.fromVersion !== undefined ||
          options.toVersion !== undefined)
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
        if (range.viaExpr) {
          console.error(
            '[WARNING] --version-expr is deprecated; use --from-version/--to-version instead.',
          );
        }
        console.log(migrationPrompt(range.from, range.to));
        return;
      }
      if (action === 'strip-legacy-headers') {
        if (
          options.kind !== undefined ||
          options.versionExpr !== undefined ||
          options.fromVersion !== undefined ||
          options.toVersion !== undefined
        ) {
          throw new CliError(
            'strip-legacy-headers takes no --kind/--version-expr/--from-version/--to-version',
          );
        }
        const targets = collectFeatureFiles([resolveRootSpecsDir(options.directory, ctx.io)]);
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
        console.log(`strip-legacy-headers: ${touched} file(s), ${removed} line(s) removed${mode}`);
        console.log('next: re-run `llman-sdd init --update` to refresh skills and templates');
        return;
      }
      if (action !== undefined) {
        throw new CliError(
          `unknown migrate action: ${action} (expected: prompt | strip-legacy-headers)`,
          2,
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
          2,
        );
      }
      console.log(note);
    });
  addSpecDirOption(migrate);
}
