import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  archiveChange,
  attachChange,
  changeDiff,
  changeDiffInfo,
  deriveChangeId,
  finalizeChange,
  harvestUniqueNumbers,
  newChange,
  nextUniqueNumber,
  parseTaskCheckboxes,
  renderChangeIdTemplate,
  splitVerb,
  startChange,
  validateAllSpecs,
} from '@llman-sdd/core';
import { Option, type Command } from 'commander';

import {
  loadCliConfig,
  loadCliConfigUnchecked,
  loadSpecEntries,
  newIo,
  resolveChangeIdOrExit,
} from '../cli-shared.ts';
import { makeCliGit } from '../io.ts';

function runValidateSweep(): boolean {
  const report = validateAllSpecs(loadSpecEntries(), newIo());
  return report.verdicts.some((v) => !v.ok);
}

/** `--method squash|ff` guard shared by `change archive` / `change finalize`. */
function assertMergeMethod(method: string | undefined): boolean {
  if (method === undefined || method === 'squash' || method === 'ff') return true;
  console.error(`invalid --method: ${method}`);
  process.exitCode = 1;
  return false;
}

export function registerChange(program: Command): void {
  const change = program
    .command('change')
    .description('Change lifecycle: new / start / attach / next-id / diff / finalize');

  change
    .command('new')
    .description('Create a change draft (exactly one of <id> or --from)')
    .argument('[id]')
    .option('--from <description>', 'description the id is derived from')
    .option('--verb <verb>', 'explicit verb for change_id.template rendering')
    .option('--force', 'overwrite an existing proposal.md')
    .option('--dry-run', 'print the resulting id without creating anything')
    .action(
      (
        id: string | undefined,
        options: { from?: string; verb?: string; force?: boolean; dryRun?: boolean },
      ) => {
        if ((id === undefined) === (options.from === undefined)) {
          console.error('<CHANGE> and --from are mutually exclusive; pass one or the other');
          process.exitCode = 1;
          return;
        }
        if (options.dryRun) {
          console.log(id ?? deriveChangeId(options.from as string));
          return;
        }
        const cliConfig = loadCliConfig();
        const template = cliConfig?.change_id?.template;
        if (options.from !== undefined && template) {
          const slug = deriveChangeId(options.from);
          const { verb, subject } = splitVerb(slug, (options as { verb?: string }).verb);
          const derived = renderChangeIdTemplate(template, {
            llman_sdd_unique_id: nextUniqueNumber(
              {
                listDir: (p) => readdirSync(resolve(p)),
                isDirectory: (p) => statSync(resolve(p)).isDirectory(),
              },
              'llmanspec',
            ),
            verb,
            subject,
            date: new Date().toISOString().slice(0, 10),
          });
          console.log(`derived change id: ${derived}`);
          const io = newIo();
          const result = newChange(io, { id: derived, force: options.force });
          console.log(`./${result.path}`);
          return;
        }
        const io = newIo();
        const result = newChange(io, { id, from: options.from, force: options.force });
        if (options.from !== undefined) console.log(`derived change id: ${result.id}`);
        console.log(`./${result.path}`);
      },
    );

  change
    .command('start')
    .description('Bind the change to a new feature branch (clean tree + default branch gates)')
    .argument('<id>')
    .option(
      '--branch-prefix <prefix>',
      'feature branch prefix (default: sdd.branch_prefix config, then sdd/)',
    )
    .action((id: string, options: { branchPrefix?: string }) => {
      const resolved = resolveChangeIdOrExit(program, id);
      if (resolved === null) return;
      const git = makeCliGit(process.cwd());
      const config = loadCliConfig();
      const result = startChange(git, newIo(), resolved.id, {
        branchPrefix: options.branchPrefix ?? config?.sdd?.branch_prefix ?? 'sdd/',
      });
      console.log(
        `started change \`${resolved.id}\` → branch \`${result.branch}\` base \`${result.baseSha}\` base-branch \`${result.baseBranch}\``,
      );
    });

  change
    .command('attach')
    .description('Bind the change to the current feature branch')
    .argument('<id>')
    .option('--force', 'rebind an already attached change to the current branch')
    .option('--base <branch>', 'explicit fork-point branch to record')
    .action((id: string, options: { force?: boolean; base?: string }) => {
      const resolved = resolveChangeIdOrExit(program, id);
      if (resolved === null) return;
      const result = attachChange(makeCliGit(process.cwd()), newIo(), resolved.id, {
        force: options.force,
        base: options.base,
      });
      console.log(
        `attached change \`${resolved.id}\` → branch \`${result.branch}\` base \`${result.baseSha}\` base-branch \`${result.baseBranch}\``,
      );
    });

  change
    .command('next-id')
    .description('Preview the next free change id number (read-only)')
    .option('--json', 'emit {maxNumber, nextNumber, warnings}')
    .action((options: { json?: boolean }) => {
      const harvest = harvestUniqueNumbers(
        {
          listDir: (p) => readdirSync(resolve(p)),
          isDirectory: (p) => statSync(resolve(p)).isDirectory(),
        },
        'llmanspec',
      );
      if (options.json) {
        console.log(JSON.stringify(harvest, null, 2));
        return;
      }
      if (harvest.maxNumber === null) console.log('no numbered change dirs found in tree');
      else console.log(`max number in tree: ${harvest.maxNumber}`);
      console.log(`next free number: ${harvest.nextNumber}`);
      for (const w of harvest.warnings) console.error(`warning: ${w}`);
    });

  change
    .command('archive')
    .description('Independent seal-off: task gates + merge + archive rename + commit')
    .argument('<id>')
    .option('--into <branch>', 'target branch to merge into')
    .option('--method <method>', 'merge method: squash | ff')
    .option('--dry-run', 'print the rename plan only')
    .option('--skip-specs', 'legacy flag accepted for v1 parity (no longer merges deltas)')
    .addOption(new Option('--force', 'skip task and git gates').hideHelp())
    .action(
      (
        id: string,
        options: { into?: string; method?: string; dryRun?: boolean; force?: boolean },
      ) => {
        if (!assertMergeMethod(options.method)) return;
        const resolved = resolveChangeIdOrExit(program, id);
        if (resolved === null) return;
        id = resolved.id;
        const io = newIo();
        if (options.dryRun) {
          const date = new Date().toISOString().slice(0, 10);
          console.log(
            `Would move llmanspec/changes/${id} -> llmanspec/changes/archive/${date}-${id}`,
          );
          return;
        }
        const config = loadCliConfigUnchecked();
        // v1 task gate: blocked output + options list before the error.
        if (!options.force) {
          const tasksPath = `llmanspec/changes/${id}/tasks.md`;
          if (existsSync(tasksPath)) {
            const { pendingLines } = parseTaskCheckboxes(readFileSync(tasksPath, 'utf8'));
            if (pendingLines.length > 0) {
              console.error(`Archive blocked: ${pendingLines.length} unchecked task(s).`);
              // pendingLines are trimmed `- [ ] text` lines; re-derive the bare
              // task text after the checkbox (byte-identical to the former
              // inline `[ ]` regex extraction).
              for (const line of pendingLines) {
                console.error(`  - [ ] ${line.replace(/^-\s+\[ \]\s*/u, '').trim()}`);
              }
              console.error(
                'Options:\n  1. Complete the remaining tasks\n  2. Use --force to archive anyway (not recommended)',
              );
              throw new Error('archive blocked by unchecked tasks');
            }
          }
        }
        const result = archiveChange(makeCliGit(process.cwd()), io, id, {
          into: options.into,
          method: options.method as 'squash' | 'ff' | undefined,
          force: options.force,
          minCompletionRatio: config?.archive?.min_completion_ratio ?? undefined,
        });
        const archiveName = (result.archiveDir ?? '').slice(
          (result.archiveDir ?? '').lastIndexOf('/') + 1,
        );
        console.log(`Change '${id}' archived as '${archiveName}'.`);
      },
    );

  change
    .command('diff')
    .description('Print the bound branch diff vs base')
    .argument('<id>')
    .option('--json', 'emit {change, branch, base, commitCount}')
    .option('--export-patch <path>', 'write the diff to a file instead of stdout')
    .action((id: string, options: { json?: boolean; exportPatch?: string }) => {
      const resolved = resolveChangeIdOrExit(program, id);
      if (resolved === null) return;
      id = resolved.id;
      const git = makeCliGit(process.cwd());
      if (options.json) {
        const info = changeDiffInfo(git, newIo(), id);
        console.log(JSON.stringify(info, null, 2));
        return;
      }
      const diff = changeDiff(git, newIo(), id);
      if (options.exportPatch !== undefined) {
        writeFileSync(options.exportPatch, diff);
        console.log(`wrote ${options.exportPatch}`);
        return;
      }
      console.log(diff);
    });

  change
    .command('finalize')
    .description('Validate, merge the feature branch, archive docs, close out with one commit')
    .argument('<id>')
    .option('--into <branch>', 'merge target override (defaults to base_branch)')
    .option(
      '--method <method>',
      'merge method: squash | ff (default: sdd.merge_method config, then squash)',
    )
    .option('--no-check', 'skip the pre-merge validation sweep')
    .option('--no-commit', 'skip the close-out commit (manual/CI history)')
    .action(
      (
        id: string,
        options: { into?: string; method?: string; check?: boolean; commit?: boolean },
      ) => {
        if (!assertMergeMethod(options.method)) return;
        if (options.check !== false) {
          const failed = runValidateSweep();
          if (failed) {
            console.error('finalize aborted: validation sweep failed (use --no-check to skip)');
            process.exitCode = 1;
            return;
          }
        }
        const resolved = resolveChangeIdOrExit(program, id);
        if (resolved === null) return;
        id = resolved.id;
        const config = loadCliConfig();
        const method = options.method ?? config?.sdd?.merge_method ?? 'squash';
        const result = finalizeChange(makeCliGit(process.cwd()), newIo(), id, {
          into: options.into,
          method: method as 'squash' | 'ff',
          noCommit: options.commit === false,
        });
        for (const w of result.warnings) console.error(`[WARNING] ${w}`);
        if (options.commit === false) {
          console.log(
            `finalized \`${id}\` → ${result.archiveDir} on ${result.target} (close-out commit skipped — run: git add -A && git commit -m "archive(sdd): ${id}")`,
          );
          return;
        }
        console.log(
          `finalized \`${id}\` → ${result.archiveDir} (commit "${result.commitSubject}" on ${result.target})`,
        );
      },
    );
}
