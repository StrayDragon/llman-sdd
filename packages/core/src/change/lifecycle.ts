import {
  currentBranch,
  defaultBranch,
  dirtyCount,
  isCleanTree,
  mergeBase,
  revParseHead,
  type GitLike,
} from '../git/spawnGit.ts';
import { readBinding, writeBinding } from './frontmatter.ts';
/**
 * Change lifecycle (change-lifecycle capability): new / start / attach /
 * finalize with the v1 git-native contract (r14-r16). All effects flow
 * through the injected GitLike and FsIo ports — this module stays pure.
 * FsIo paths are ROOT-RELATIVE (e.g. `llmanspec/changes/<id>/proposal.md`);
 * the git cwd binding lives in the GitLike adapter.
 */
import { DRAFT_PROPOSAL_TEMPLATE, deriveChangeId } from './id.ts';
import { parseTaskCheckboxes } from './tasks.ts';

export interface FsIo {
  exists(path: string): boolean;
  readText(path: string): string;
  /** writeText creates parent directories as needed. */
  writeText(path: string, content: string): void;
  rename(from: string, to: string): void;
  listDir(path: string): string[];
}

export class LifecycleError extends Error {}

export const CHANGES_DIR = 'llmanspec/changes';
const proposalPath = (id: string): string => `${CHANGES_DIR}/${id}/proposal.md`;

/** `change new [id] --from DESC --force`: derive a legal id and write the draft shell. */
export function newChange(
  io: FsIo,
  opts: { id?: string; from?: string; force?: boolean },
): { id: string; path: string } {
  const id = opts.id ?? deriveChangeId(opts.from ?? '');
  const path = proposalPath(id);
  if (io.exists(path) && !opts.force) {
    throw new LifecycleError(
      `change proposal already exists: ./${path} (pass --force to overwrite)`,
    );
  }
  io.writeText(path, `---\ndepends_on: []\n---\n\n${DRAFT_PROPOSAL_TEMPLATE}`);
  return { id, path };
}

/** `change start`: clean-tree + default-branch gates, then branch + binding. */
export function startChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: { branchPrefix?: string } = {},
): { branch: string; baseBranch: string; baseSha: string } {
  const path = proposalPath(id);
  if (!io.exists(path)) throw new LifecycleError(`proposal not found: ${path}`);
  const dirty = dirtyCount(git);
  if (dirty > 0)
    throw new LifecycleError(
      `dirty tree: ${dirty} uncommitted files; commit/stash before \`change start\``,
    );
  const baseBranch = defaultBranch(git);
  const here = currentBranch(git);
  if (here !== null && here !== baseBranch) {
    throw new LifecycleError(
      `already on non-default branch \`${here}\`; use \`change attach\` to bind it, or switch to the default branch before \`change start\``,
    );
  }
  if (here === null) throw new LifecycleError('detached HEAD is not allowed for change binding');
  const branchPrefix = opts.branchPrefix ?? 'sdd/';
  const branch = `${branchPrefix}${id}`;
  git.run(['switch', '-c', branch]);
  const baseSha =
    currentBranch(git) !== null ? mergeBase(git, 'HEAD', baseBranch) : revParseHead(git);
  io.writeText(path, writeBinding(io.readText(path), { branch, baseBranch, baseSha }));
  return { branch, baseBranch, baseSha };
}

/** `change attach`: bind the current branch — same branch gate family as start (r31). */
export function attachChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: { force?: boolean; base?: string } = {},
): { branch: string; baseBranch: string; baseSha: string } {
  const path = proposalPath(id);
  if (!io.exists(path)) throw new LifecycleError(`proposal not found: ${path}`);
  const existing = readBinding(io.readText(path));
  if (!opts.force && existing !== null) {
    throw new LifecycleError(
      `change \`${id}\` already attached to branch \`${existing.branch}\` (base ${existing.baseSha}); pass --force to rebind`,
    );
  }
  const configuredBase = opts.base ?? defaultBranch(git);
  const branch = currentBranch(git);
  if (branch === null || branch === '') {
    throw new LifecycleError('detached HEAD is not allowed for change binding');
  }
  if (opts.base !== undefined) {
    if (
      git.runOpt(['show-ref', '--verify', '--quiet', `refs/heads/${opts.base}`]) === null &&
      git.runOpt(['show-ref', '--verify', '--quiet', `refs/remotes/${opts.base}`]) === null
    ) {
      throw new LifecycleError(
        `base branch \`${opts.base}\` does not exist; --base records the fork source branch for merge-target resolution (r111)`,
      );
    }
    if (opts.base === branch) {
      throw new LifecycleError(`--base must differ from the bound branch \`${branch}\``);
    }
  }
  if (branch === configuredBase) {
    throw new LifecycleError(
      `changes must not attach on the default branch (\`${branch}\`); ` +
        'create/switch to a feature branch first (or use `change start`)',
    );
  }
  const baseSha = mergeBase(git, branch, configuredBase);
  io.writeText(
    path,
    writeBinding(io.readText(path), { branch, baseBranch: configuredBase, baseSha }),
  );
  return { branch, baseBranch: configuredBase, baseSha };
}

export interface FinalizeResult {
  target: string;
  archiveDir: string;
  warnings: string[];
  commitSubject: string;
}

export interface ArchiveTaskGate {
  blocked: boolean;
  reasons: string[];
}

/** r40 task gate: unchecked tasks always block; ratio gate when configured. */
export function archiveTaskGate(
  tasksMd: string | null,
  minCompletionRatio: number | undefined,
): ArchiveTaskGate {
  const reasons: string[] = [];
  if (tasksMd !== null) {
    const { completed, total, pendingLines } = parseTaskCheckboxes(tasksMd);
    if (total > 0 && completed < total) {
      reasons.push(`archive blocked by unchecked tasks (${total - completed}/${total} pending)`);
      for (const line of pendingLines) reasons.push(line);
    }
    if (minCompletionRatio !== undefined && total > 0 && completed / total < minCompletionRatio) {
      reasons.push(
        `completion ${((completed / total) * 100).toFixed(0)}% below archive.min_completion_ratio ${(minCompletionRatio * 100).toFixed(0)}%`,
      );
    }
  }
  return { blocked: reasons.length > 0, reasons };
}

/** `change finalize`: merge (squash default) + archive rename + close-out commit. */
export function finalizeChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: { into?: string; method?: 'squash' | 'ff'; today?: string; noCommit?: boolean } = {},
): FinalizeResult {
  const path = proposalPath(id);
  const binding = readBinding(io.readText(path));
  if (binding === null) {
    throw new LifecycleError(`change \`${id}\` has no branch binding — run start/attach first`);
  }
  // r15 (v1 r94): finalize runs on the bound branch — any other branch must
  // fail before any write (no switch, no merge, no rename).
  const current = currentBranch(git);
  if (current !== binding.branch) {
    throw new LifecycleError(
      `finalize must run on the bound branch \`${binding.branch}\` (current: ${current ?? 'detached HEAD'})`,
    );
  }
  const method = opts.method ?? 'squash';
  const target = opts.into ?? binding.baseBranch ?? defaultBranch(git);
  return mergeRenameCommit(git, io, id, binding.branch, target, method, opts.today, opts.noCommit);
}

/** Shared close-out: merge → archive rename → single archive(sdd) commit. */
function mergeRenameCommit(
  git: GitLike,
  io: FsIo,
  id: string,
  featureBranch: string,
  target: string,
  method: 'squash' | 'ff',
  today?: string,
  noCommit?: boolean,
): FinalizeResult {
  const warnings: string[] = [];
  git.run(['switch', target]);
  const mergeArgs =
    method === 'ff' ? ['merge', '--ff-only', featureBranch] : ['merge', '--squash', featureBranch];
  if (git.runOpt(mergeArgs) === null) {
    git.runOpt(['merge', '--abort']);
    warnings.push(
      `merge ${method} failed — resolve manually, e.g. \`git merge ${method === 'ff' ? '--ff-only' : '--squash'} ${featureBranch}\``,
    );
  }

  const date = today ?? new Date().toISOString().slice(0, 10);
  const archiveDir = `${CHANGES_DIR}/archive/${date}-${id}`;
  io.rename(`${CHANGES_DIR}/${id}`, archiveDir);

  if (noCommit) return { target, archiveDir, warnings, commitSubject: '' };
  git.run(['add', '-A']);
  const commitSubject = `archive(sdd): ${id}`;
  git.run(['commit', '-m', commitSubject]);
  return { target, archiveDir, warnings, commitSubject };
}

/** `change archive`: independent seal-off with task + strict git gates (r39/r40). */
export function archiveChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: {
    into?: string;
    method?: 'squash' | 'ff';
    force?: boolean;
    minCompletionRatio?: number;
    today?: string;
  } = {},
): FinalizeResult {
  const path = proposalPath(id);
  const binding = readBinding(io.readText(path));
  if (!opts.force && binding === null) {
    throw new LifecycleError(`change \`${id}\` has no branch binding — run start/attach first`);
  }
  if (!opts.force) {
    const tasksPath = `${CHANGES_DIR}/${id}/tasks.md`;
    const gate = archiveTaskGate(
      io.exists(tasksPath) ? io.readText(tasksPath) : null,
      opts.minCompletionRatio,
    );
    if (gate.blocked) throw new LifecycleError(gate.reasons.join('\n'));
    const current = currentBranch(git);
    if (current === null || current === '')
      throw new LifecycleError('detached HEAD — cannot archive');
    if (current !== binding?.branch) {
      throw new LifecycleError(
        `archive must run on attached branch \`${binding?.branch}\` (current: \`${current}\`)`,
      );
    }
    if (current === defaultBranch(git)) {
      throw new LifecycleError('archive must not run on the default branch');
    }
    if (!isCleanTree(git)) throw new LifecycleError('working tree must be clean to archive');
  } else if (binding === null) {
    throw new LifecycleError(`change \`${id}\` has no branch binding — cannot merge`);
  }
  const method = opts.method ?? 'squash';
  const target = opts.into ?? binding?.baseBranch ?? defaultBranch(git);
  return mergeRenameCommit(git, io, id, binding?.branch as string, target, method, opts.today);
}

/** `change diff <id>`: full diff of the bound branch vs base. */
export function changeDiff(git: GitLike, io: FsIo, id: string): string {
  const binding = readBinding(io.readText(proposalPath(id)));
  if (binding === null) throw new LifecycleError(`change \`${id}\` has no branch binding`);
  const base = binding.baseBranch ?? defaultBranch(git);
  return git.run(['diff', `${base}...${binding.branch}`]);
}

export interface ChangeDiffInfo {
  change: string;
  branch: string;
  base: string;
  commitCount: number;
}

/** `change diff --json` (r46): structured bound-branch summary. */
export function changeDiffInfo(git: GitLike, io: FsIo, id: string): ChangeDiffInfo {
  const binding = readBinding(io.readText(proposalPath(id)));
  if (binding === null) throw new LifecycleError(`change \`${id}\` has no branch binding`);
  const count =
    git.runOpt(['rev-list', '--count', `${binding.baseSha}...${binding.branch}`]) ?? '0';
  return { change: id, branch: binding.branch, base: binding.baseSha, commitCount: Number(count) };
}
