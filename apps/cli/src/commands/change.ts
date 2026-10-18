import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  CLOSE_OUT_TASK_HINT,
  closeOutTaskLines,
  archiveChange,
  attachChange,
  changeDiff,
  changeDiffInfo,
  defaultBranch,
  deriveChangeId,
  finalizeChange,
  harvestAcrossWorktrees,
  archiveTaskGate,
  isCleanTree,
  newChange,
  nextUniqueNumber,
  renderChangeIdTemplate,
  splitVerb,
  startChange,
  validateAllSpecs,
  decideCloseOutHarness,
  extractFrontmatter,
  readNeedsSpecsChange,
  type GitLike,
} from '@llman-sdd/core';
import { Option, type Command } from 'commander';

import {
  CliError,
  loadCliConfig,
  loadRootSpecEntries,
  resolveChangeIdOrExit,
  type CliContext,
  addReportOutputOptions,
  emitReport,
  resolveOutMode,
} from '../cli-shared.ts';
import { makeCliHarnessRunner } from '../harness.ts';

function runValidateSweep(ctx: CliContext): boolean {
  const report = validateAllSpecs(loadRootSpecEntries(undefined, ctx.io));
  return report.verdicts.some((v) => !v.ok);
}

/** r95: human-readable provenance of a recorded base_branch. */
const BASE_SOURCE_HUMAN: Record<string, string> = {
  flag: '--base',
  config: 'branch.<name>.base',
  upstream: 'local upstream',
  worktree: 'current branch (worktree mode)',
  default: 'default-branch resolution',
};

/** r95: deviation warning when the recorded base_branch is not the default
 * branch — surfaced on attach and on start's --base/--worktree paths. Runs
 * after start/attach already wrote their effects, so an unresolvable default
 * branch skips the warning instead of failing the command. */
function warnBaseBranchDeviation(
  git: GitLike,
  result: { baseBranch: string; baseSource: string },
): void {
  let def: string;
  try {
    def = defaultBranch(git);
  } catch {
    return;
  }
  if (result.baseBranch === def) return;
  const human = BASE_SOURCE_HUMAN[result.baseSource] ?? result.baseSource;
  console.error(
    `[WARNING] base_branch \`${result.baseBranch}\` deviates from default branch \`${def}\` ` +
      `(source: ${human}); merge target defaults to \`${result.baseBranch}\` — ` +
      'pass --base <branch> to override',
  );
}

/** r81: run or refuse the spec verification command before any merge or rename. */
function enforceCloseOutHarness(ctx: CliContext, id: string, noCheck: boolean): void {
  const proposalPath = `llmanspec/changes/${id}/proposal.md`;
  const proposal = existsSync(proposalPath) ? readFileSync(proposalPath, 'utf8') : '';
  const needsSpecsChange = readNeedsSpecsChange(extractFrontmatter(proposal));
  const runCommand = loadCliConfig()?.specs?.check_command ?? null;
  const decision = decideCloseOutHarness({
    noCheck,
    needsSpecsChange,
    runCommand,
    nested: process.env.LLMAN_SDD_HARNESS_ACTIVE === '1',
  });
  if (decision.kind === 'abort') {
    throw new CliError(`close-out aborted: ${decision.message}`);
  }
  if (decision.kind === 'skip') {
    if (decision.announce) console.error('spec check skipped: --no-check');
    if (decision.warning !== undefined) console.error(`[WARNING] ${decision.warning}`);
    return;
  }
  const result = makeCliHarnessRunner().run(decision.command, ctx.root);
  if (result.spawnError !== undefined || result.exitCode !== 0) {
    const why = result.spawnError ?? `exit ${result.exitCode}`;
    throw new CliError(`close-out aborted: spec check failed (${why})`);
  }
}

/** `--method squash|ff` guard shared by `change archive` / `change finalize`. */
function assertMergeMethod(method: string | undefined): void {
  if (method !== undefined && method !== 'squash' && method !== 'ff') {
    throw new CliError(`invalid --method: ${method}`, 2);
  }
}

/**
 * Unified `change new --from` id derivation (r44/r60). With a configured
 * `change_id.template` the id is rendered through it (Strict: referencing an
 * unprovided variable throws, surfacing in both dry-run and real paths); the
 * heuristic slug is otherwise returned unchanged unless an explicit `--verb`
 * is given, in which case the override is applied as `{verb}-{subject}` (r44).
 */
/**
 * r35: `change next-id` / change-id harvest scan must skip symlinks and dot
 * directories. `lstat` (never `stat`) reports the link itself, so a symlink —
 * even one pointing at a directory — is not a directory here and is neither
 * counted nor recursed into. The next-id harvest is the single consumer that
 * requires this no-follow semantics cycle-wide.
 */
function isDirectoryNoFollow(path: string): boolean {
  return lstatSync(resolve(path)).isDirectory();
}
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
          isDirectory: isDirectoryNoFollow,
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

export function registerChange(program: Command, ctx: CliContext): void {
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
          const io = ctx.io;
          const result = newChange(io, { id: derived, force: options.force });
          console.log(`./${result.path}`);
          return;
        }
        const io = ctx.io;
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
      'explicit fork-source branch to record (must be an existing local branch differing from the new branch; exempts the default-branch gate)',
    )
    .option(
      '--worktree',
      'create the branch in a dedicated worktree (sdd.worktree_root / sdd.worktree_naming config) instead of switching this checkout',
    )
    .action((id: string, options: { branchPrefix?: string; base?: string; worktree?: boolean }) => {
      const resolved = resolveChangeIdOrExit(ctx, program, id);
      const git = ctx.git;
      const config = loadCliConfig();
      const result = startChange(git, ctx.io, resolved.id, {
        branchPrefix: options.branchPrefix ?? config?.sdd?.branch_prefix ?? 'sdd/',
        base: options.base,
        worktree: options.worktree,
        worktreeRoot: config?.sdd?.worktree_root ?? undefined,
        worktreeNaming: config?.sdd?.worktree_naming ?? undefined,
      });
      warnBaseBranchDeviation(git, result);
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
    .option(
      '--base <branch>',
      'explicit fork-point branch to record (must be an existing local branch)',
    )
    .action((id: string, options: { force?: boolean; base?: string }) => {
      const resolved = resolveChangeIdOrExit(ctx, program, id);
      const git = ctx.git;
      const result = attachChange(git, ctx.io, resolved.id, {
        force: options.force,
        base: options.base,
      });
      warnBaseBranchDeviation(git, result);
      console.log(
        `attached change \`${resolved.id}\` → branch \`${result.branch}\` base \`${result.baseSha}\` base-branch \`${result.baseBranch}\``,
      );
    });

  const nextId = change
    .command('next-id')
    .description('Preview the next free change id number (read-only)');
  addReportOutputOptions(nextId, { outputHint: 'json (r35 harvest payload); toon default' });
  nextId.action((options: { json?: boolean; output?: string; compactJson?: boolean }) => {
    // r35: the scan covers this tree plus every linked git worktree's own
    // llmanspec/ tree (degrades to the current tree when worktree list fails).
    const harvest = harvestAcrossWorktrees(
      ctx.git,
      {
        listDir: (p) => readdirSync(resolve(p)),
        isDirectory: isDirectoryNoFollow,
      },
      'llmanspec',
    );
    // r35: the human face is exactly the two legacy lines (bare default and
    // explicit `--output human`); machine modes render the harvest IR through
    // the shared pipeline.
    const human = (): string => {
      const lines: string[] = [];
      if (harvest.maxNumber === null) lines.push('no numbered change dirs found in tree');
      else lines.push(`max number in tree: ${harvest.maxNumber}`);
      lines.push(`next free number: ${harvest.nextNumber}`);
      return lines.join('\n');
    };
    const bare =
      options.output === undefined && options.json !== true && options.compactJson !== true;
    if (bare) console.log(human());
    else emitReport(harvest, options, human);
    for (const w of harvest.warnings) console.error(`warning: ${w}`);
  });

  change
    .command('archive')
    .description(
      'Independent seal-off: task gates + merge + archive rename + commit (cold backup: `llman-sdd archive freeze`)',
    )
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
        const resolved = resolveChangeIdOrExit(ctx, program, id);
        id = resolved.id;
        const io = ctx.io;
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
          if (!isCleanTree(ctx.git)) {
            throw new CliError('`change archive` requires a clean working tree');
          }
        }
        enforceCloseOutHarness(ctx, id, false);
        const result = archiveChange(ctx.git, io, id, {
          into: options.into,
          method: options.method as 'squash' | 'ff' | undefined,
          force: options.force,
          skipCleanTree: true,
          today: new Date().toISOString().slice(0, 10),
        });
        // node:path.basename — platform-aware (win32 backslashes would defeat
        // a hand-rolled lastIndexOf('/')).
        const archiveName = basename(result.archiveDir ?? '');
        console.log(`Change '${id}' archived as '${archiveName}'.`);
        if (result.executedIn !== null) {
          console.log(`executed in target worktree ${result.executedIn}`);
        }
      },
    );

  const diffCmd = change
    .command('diff')
    .description('Print the bound branch diff vs base')
    .argument('<id>')
    .option('--export-patch <path>', 'write the diff to a file instead of stdout');
  addReportOutputOptions(diffCmd, {
    outputHint: 'json {change,branch,base,commitCount}; toon default',
  });
  diffCmd.action(
    (
      id: string,
      options: { json?: boolean; output?: string; compactJson?: boolean; exportPatch?: string },
    ) => {
      const resolved = resolveChangeIdOrExit(ctx, program, id);
      id = resolved.id;
      const git = ctx.git;
      const diff = changeDiff(git, ctx.io, id);
      if (options.exportPatch !== undefined) {
        // writeText creates parent dirs — exporting into a fresh path like
        // out/change.patch must not ENOENT. Export wins over any output mode.
        ctx.io.writeText(options.exportPatch, diff);
        console.log(`wrote ${options.exportPatch}`);
        return;
      }
      if (resolveOutMode(options.output, options.json, options.compactJson) !== 'human') {
        emitReport(changeDiffInfo(git, ctx.io, id), options);
        return;
      }
      // T37: an empty diff says so instead of printing nothing.
      if (diff.trim() === '') console.log('no differences against the base (empty diff)');
      else console.log(diff);
    },
  );

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
          const failed = runValidateSweep(ctx);
          if (failed) {
            throw new CliError(
              'finalize aborted: validation sweep failed (use --no-check to skip)',
            );
          }
        }
        const resolved = resolveChangeIdOrExit(ctx, program, id);
        id = resolved.id;
        enforceCloseOutHarness(ctx, id, options.check === false);
        const config = loadCliConfig();
        const method = options.method ?? config?.sdd?.merge_method ?? 'squash';
        const result = finalizeChange(ctx.git, ctx.io, id, {
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
