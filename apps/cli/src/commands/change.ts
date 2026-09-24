import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CLOSE_OUT_TASK_HINT,
  closeOutTaskLines,
  archiveChange,
  attachChange,
  changeDiff,
  changeDiffInfo,
  deriveChangeId,
  finalizeChange,
  harvestAcrossWorktrees,
  archiveTaskGate,
  newChange,
  nextUniqueNumber,
  renderChangeIdTemplate,
  splitVerb,
  startChange,
  validateAllSpecs,
} from '@llman-sdd/core';
import { Option, type Command } from 'commander';

import {
  CliError,
  loadCliConfig,
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
function assertMergeMethod(method: string | undefined): void {
  if (method !== undefined && method !== 'squash' && method !== 'ff') {
    throw new CliError(`invalid --method: ${method}`);
  }
}

/**
 * Unified `change new --from` id derivation (r44/r60). With a configured
 * `change_id.template` the id is rendered through it (Strict: referencing an
 * unprovided variable throws, surfacing in both dry-run and real paths); the
 * heuristic slug is otherwise returned unchanged unless an explicit `--verb`
 * is given, in which case the override is applied as `{verb}-{subject}` (r44).
 */
function deriveNewId(description: string, verb: string | undefined): string {
  const slug = deriveChangeId(description);
  const cliConfig = loadCliConfig();
  const template = cliConfig?.change_id?.template;
  if (template) {
    const { verb: v, subject } = splitVerb(slug, verb);
    return renderChangeIdTemplate(template, {
      llman_sdd_unique_id: nextUniqueNumber(
        {
          listDir: (p) => readdirSync(resolve(p)),
          isDirectory: (p) => statSync(resolve(p)).isDirectory(),
        },
        'llmanspec',
      ),
      verb: v,
      subject,
      date: new Date().toISOString().slice(0, 10),
    });
  }
  if (verb !== undefined) {
    const { verb: v, subject } = splitVerb(slug, verb);
    return `${v}-${subject}`;
  }
  return slug;
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
          throw new CliError('<CHANGE> and --from are mutually exclusive; pass one or the other');
        }
        if (options.dryRun) {
          console.log(id ?? deriveNewId(options.from as string, options.verb));
          return;
        }
        if (options.from !== undefined) {
          const derived = deriveNewId(options.from, options.verb);
          console.log(`derived change id: ${derived}`);
          const io = newIo();
          const result = newChange(io, { id: derived, force: options.force });
          console.log(`./${result.path}`);
          return;
        }
        const io = newIo();
        const result = newChange(io, { id, force: options.force });
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
    .option(
      '--base <branch>',
      'explicit fork-source branch to record (must exist and differ from the new branch; exempts the default-branch gate)',
    )
    .option(
      '--worktree',
      'create the branch in a dedicated worktree (sdd.worktree_root / sdd.worktree_naming config) instead of switching this checkout',
    )
    .action((id: string, options: { branchPrefix?: string; base?: string; worktree?: boolean }) => {
      const resolved = resolveChangeIdOrExit(program, id);
      const git = makeCliGit(process.cwd());
      const config = loadCliConfig();
      const result = startChange(git, newIo(), resolved.id, {
        branchPrefix: options.branchPrefix ?? config?.sdd?.branch_prefix ?? 'sdd/',
        base: options.base,
        worktree: options.worktree,
        worktreeRoot: config?.sdd?.worktree_root ?? undefined,
        worktreeNaming: config?.sdd?.worktree_naming ?? undefined,
      });
      console.log(
        `started change \`${resolved.id}\` → branch \`${result.branch}\` base \`${result.baseSha}\` base-branch \`${result.baseBranch}\``,
      );
      if (result.worktreePath !== undefined) console.log(`worktree ${result.worktreePath}`);
    });

  change
    .command('attach')
    .description('Bind the change to the current feature branch')
    .argument('<id>')
    .option('--force', 'rebind an already attached change to the current branch')
    .option('--base <branch>', 'explicit fork-point branch to record')
    .action((id: string, options: { force?: boolean; base?: string }) => {
      const resolved = resolveChangeIdOrExit(program, id);
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
      // r35: the scan covers this tree plus every linked git worktree's own
      // llmanspec/ tree (degrades to the current tree when worktree list fails).
      const harvest = harvestAcrossWorktrees(
        makeCliGit(process.cwd()),
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
    .addOption(new Option('--force', 'skip task and git gates').hideHelp())
    .action(
      (
        id: string,
        options: { into?: string; method?: string; dryRun?: boolean; force?: boolean },
      ) => {
        assertMergeMethod(options.method);
        const resolved = resolveChangeIdOrExit(program, id);
        id = resolved.id;
        const io = newIo();
        if (options.dryRun) {
          const date = new Date().toISOString().slice(0, 10);
          console.log(
            `Would move llmanspec/changes/${id} -> llmanspec/changes/archive/${date}-${id}`,
          );
          return;
        }
        // r40 task gate: single core implementation (archiveTaskGate); the
        // CLI only renders the blocked output + options list, byte-identical.
        if (!options.force) {
          const tasksPath = `llmanspec/changes/${id}/tasks.md`;
          const gate = archiveTaskGate(
            existsSync(tasksPath) ? readFileSync(tasksPath, 'utf8') : null,
          );
          if (gate.blocked) {
            console.error(`Archive blocked: ${gate.pendingLines.length} unchecked task(s).`);
            for (const line of gate.pendingLines) {
              console.error(`  - [ ] ${line.replace(/^-\s+\[ \]\s*/u, '').trim()}`);
            }
            // D9: point at a close-out pseudo-task with the single shared hint.
            const closeOut = closeOutTaskLines(gate.pendingLines);
            if (closeOut.length > 0) {
              console.error(
                `  task "${closeOut[0]?.replace(/^-\s+\[ \]\s*/u, '').trim() ?? ''}" looks like a close-out step; ${CLOSE_OUT_TASK_HINT}`,
              );
            }
            console.error(
              'Options:\n  1. Complete the remaining tasks\n  2. Use --force to archive anyway (not recommended)',
            );
            throw new Error('archive blocked by unchecked tasks');
          }
        }
        const result = archiveChange(makeCliGit(process.cwd()), io, id, {
          into: options.into,
          method: options.method as 'squash' | 'ff' | undefined,
          force: options.force,
          today: new Date().toISOString().slice(0, 10),
        });
        const archiveName = (result.archiveDir ?? '').slice(
          (result.archiveDir ?? '').lastIndexOf('/') + 1,
        );
        console.log(`Change '${id}' archived as '${archiveName}'.`);
        if (result.executedIn !== null) {
          console.log(`executed in target worktree ${result.executedIn}`);
        }
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
      id = resolved.id;
      const git = makeCliGit(process.cwd());
      if (options.json) {
        const info = changeDiffInfo(git, newIo(), id);
        console.log(JSON.stringify(info, null, 2));
        return;
      }
      const diff = changeDiff(git, newIo(), id);
      if (options.exportPatch !== undefined) {
        // writeText creates parent dirs — exporting into a fresh path like
        // out/change.patch must not ENOENT.
        newIo().writeText(options.exportPatch, diff);
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
        assertMergeMethod(options.method);
        if (options.check !== false) {
          const failed = runValidateSweep();
          if (failed) {
            throw new CliError(
              'finalize aborted: validation sweep failed (use --no-check to skip)',
            );
          }
        }
        const resolved = resolveChangeIdOrExit(program, id);
        id = resolved.id;
        const config = loadCliConfig();
        const method = options.method ?? config?.sdd?.merge_method ?? 'squash';
        const result = finalizeChange(makeCliGit(process.cwd()), newIo(), id, {
          into: options.into,
          method: method as 'squash' | 'ff',
          today: new Date().toISOString().slice(0, 10),
          noCommit: options.commit === false,
        });
        for (const w of result.warnings) console.error(`[WARNING] ${w}`);
        if (options.commit === false) {
          console.log(
            `finalized \`${id}\` → ${result.archiveDir} on ${result.target} (close-out commit skipped — run: git add -A && git commit -m "archive(sdd): ${id}")`,
          );
          if (result.executedIn !== null) {
            console.log(`executed in target worktree ${result.executedIn}`);
          }
          return;
        }
        console.log(
          `finalized \`${id}\` → ${result.archiveDir} (commit "${result.commitSubject}" on ${result.target})`,
        );
        if (result.executedIn !== null) {
          console.log(`executed in target worktree ${result.executedIn}`);
        }
      },
    );
}
