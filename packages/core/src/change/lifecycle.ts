import { createHash } from 'node:crypto';

import {
  currentBranch,
  defaultBranch,
  dirtyCount,
  isCleanTree,
  mergeBase,
  revParseHead,
  worktreeList,
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

// r74: single git-gate message family shared by start/attach/finalize/archive
// (stable substrings for matching; no internal requirement ids in output).
const detachedHead = (cmd: string): string =>
  `\`${cmd}\` refuses a detached HEAD; check out a branch first`;
const notOnBoundBranch = (cmd: string, bound: string, current: string | null): string =>
  `\`${cmd}\` must run on the bound branch \`${bound}\` (current: \`${current ?? 'detached HEAD'}\`)`;
const onDefaultBranch = (cmd: string, def: string): string =>
  `\`${cmd}\` must not run on the default branch \`${def}\``;
const dirtyTree = (cmd: string): string => `\`${cmd}\` requires a clean working tree`;

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

export interface StartResult {
  branch: string;
  baseBranch: string;
  baseSha: string;
  /** Absolute worktree path when started with --worktree (r68); undefined on the classic path. */
  worktreePath?: string;
}

/**
 * r68 worktree path (design D2): `<root>/<repo-basename>-<name>` where root is
 * `sdd.worktree_root` (absolute, or repo-root-relative; default = the repo
 * root's parent, the wt-style sibling layout) and name is the branch with `/`
 * folded to `-` (naming=id, default) or base32(sha256(change_id))[:8]
 * (naming=hash).
 */
function resolveWorktreePath(
  git: GitLike,
  id: string,
  branch: string,
  worktreeRoot: string | undefined,
  naming: 'id' | 'hash' | undefined,
): string {
  const toplevel = git.run(['rev-parse', '--show-toplevel']);
  const cut = toplevel.lastIndexOf('/');
  const basename = toplevel.slice(cut + 1);
  const name =
    naming === 'hash'
      ? `${basename}-${base32Sha8(id)}`
      : `${basename}-${branch.replaceAll('/', '-')}`;
  let root = cut <= 0 ? '/' : toplevel.slice(0, cut);
  if (worktreeRoot !== undefined && worktreeRoot !== '') {
    const configured = worktreeRoot.replace(/\/+$/u, '');
    root = configured.startsWith('/') ? configured : `${toplevel}/${configured}`;
  }
  return `${root}/${name}`;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** First 8 chars of base32(sha256(change_id)), lowercase RFC-4648 alphabet. */
function base32Sha8(input: string): string {
  const bytes = createHash('sha256').update(input, 'utf8').digest();
  let out = '';
  let buffer = 0;
  let bitsLeft = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5 && out.length < 8) {
      out += BASE32[(buffer >>> (bitsLeft - 5)) & 31];
      bitsLeft -= 5;
    }
    if (out.length >= 8) break;
  }
  return out;
}

/** `change start`: clean-tree + default-branch gates, then branch + binding. */
export function startChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: {
    branchPrefix?: string;
    /** r68: explicit fork source; exempts the default-branch gate (clean-tree gate stays). */
    base?: string;
    /** r68: create the branch in a dedicated worktree instead of switching this checkout. */
    worktree?: boolean;
    /** Config sdd.worktree_root (unresolved). */
    worktreeRoot?: string;
    /** Config sdd.worktree_naming. */
    worktreeNaming?: 'id' | 'hash';
  } = {},
): StartResult {
  const path = proposalPath(id);
  if (!io.exists(path)) throw new LifecycleError(`proposal not found: ${path}`);
  const dirty = dirtyCount(git);
  if (dirty > 0) throw new LifecycleError(dirtyTree('change start'));
  const here = currentBranch(git);
  if (here === null) throw new LifecycleError(detachedHead('change start'));
  const branchPrefix = opts.branchPrefix ?? 'sdd/';
  const branch = `${branchPrefix}${id}`;

  if (opts.base !== undefined) {
    if (
      git.runOpt(['show-ref', '--verify', '--quiet', `refs/heads/${opts.base}`]) === null &&
      git.runOpt(['show-ref', '--verify', '--quiet', `refs/remotes/${opts.base}`]) === null
    ) {
      throw new LifecycleError(
        `base branch \`${opts.base}\` does not exist; --base records the fork source branch for merge-target resolution`,
      );
    }
    if (opts.base === branch) {
      throw new LifecycleError(`--base must differ from the new branch \`${branch}\``);
    }
  }

  // r68 fork-source resolution: --base explicit > current branch (worktree
  // mode records the actual source, which may be a non-default branch) >
  // default branch. The classic path keeps the r14 default-branch gate.
  let baseBranch: string;
  if (opts.base !== undefined) {
    baseBranch = opts.base;
  } else if (opts.worktree) {
    baseBranch = here;
  } else {
    baseBranch = defaultBranch(git);
    if (here !== baseBranch) {
      throw new LifecycleError(
        `already on non-default branch \`${here}\`; use \`change attach\` to bind it, or switch to the default branch before \`change start\``,
      );
    }
  }

  let worktreePath: string | undefined;
  if (opts.worktree) {
    if (git.runOpt(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]) !== null) {
      throw new LifecycleError(`branch \`${branch}\` already exists; choose another change id`);
    }
    worktreePath = resolveWorktreePath(git, id, branch, opts.worktreeRoot, opts.worktreeNaming);
    if (io.exists(worktreePath)) {
      throw new LifecycleError(`worktree path already exists: ${worktreePath}`);
    }
    git.run(['worktree', 'add', '-b', branch, worktreePath]);
    // r68: the binding lands in the NEW worktree's proposal — the initiating
    // checkout stays byte-identical (zero writes through the original io).
    // The clean-tree gate guaranteed the proposal is committed at HEAD, so it
    // is present in the fresh worktree; a missing one rolls everything back.
    const wtIo = ioAt(io, worktreePath);
    if (!wtIo.exists(path)) {
      git.run(['worktree', 'remove', '--force', worktreePath]);
      git.run(['branch', '-D', branch]);
      throw new LifecycleError(
        `proposal not found in the new worktree: ${worktreePath}/${path} — commit the change docs before \`change start --worktree\``,
      );
    }
    const baseSha = mergeBase(gitAt(git, worktreePath), 'HEAD', baseBranch);
    wtIo.writeText(path, writeBinding(wtIo.readText(path), { branch, baseBranch, baseSha }));
    return { branch, baseBranch, baseSha, worktreePath };
  }
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
    throw new LifecycleError(detachedHead('change attach'));
  }
  if (opts.base !== undefined) {
    if (
      git.runOpt(['show-ref', '--verify', '--quiet', `refs/heads/${opts.base}`]) === null &&
      git.runOpt(['show-ref', '--verify', '--quiet', `refs/remotes/${opts.base}`]) === null
    ) {
      throw new LifecycleError(
        `base branch \`${opts.base}\` does not exist; --base records the fork source branch for merge-target resolution`,
      );
    }
    if (opts.base === branch) {
      throw new LifecycleError(`--base must differ from the bound branch \`${branch}\``);
    }
  }
  if (branch === configuredBase) {
    throw new LifecycleError(
      `${onDefaultBranch('change attach', branch)}; create or switch to a feature branch, or use \`change start\``,
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
  /** r69: absolute worktree path the close-out executed in; null on the classic path. */
  executedIn: string | null;
}

export interface ArchiveTaskGate {
  blocked: boolean;
  /** Trimmed unchecked-task lines (empty when not blocked). */
  pendingLines: string[];
}

/**
 * r40 task gate (single implementation): unchecked tasks block
 * unconditionally — a completion ratio below 1 implies unchecked tasks, so a
 * separate ratio threshold is unreachable and stays out of the contract. The
 * CLI renders the list; core never formats output.
 */
export function archiveTaskGate(tasksMd: string | null): ArchiveTaskGate {
  if (tasksMd === null) return { blocked: false, pendingLines: [] };
  const { completed, total, pendingLines } = parseTaskCheckboxes(tasksMd);
  if (total > 0 && completed < total) return { blocked: true, pendingLines };
  return { blocked: false, pendingLines: [] };
}

/** `change finalize`: merge (squash default) + archive rename + close-out commit. */
export function finalizeChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: { into?: string; method?: 'squash' | 'ff'; today: string; noCommit?: boolean },
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
    throw new LifecycleError(notOnBoundBranch('change finalize', binding.branch, current));
  }
  const method = opts.method ?? 'squash';
  const target = opts.into ?? binding.baseBranch ?? defaultBranch(git);
  return mergeRenameCommit(git, io, id, binding.branch, target, method, opts.today, opts.noCommit);
}

/** r69: GitLike view bound to another worktree via `git -C <path>` prefixing. */
function gitAt(git: GitLike, cwd: string): GitLike {
  return {
    run: (args) => git.run(['-C', cwd, ...args]),
    runOpt: (args) => git.runOpt(['-C', cwd, ...args]),
  };
}

/** r69: FsIo view re-rooted at another worktree (root-relative paths join). */
function ioAt(io: FsIo, root: string): FsIo {
  const at = (p: string): string => (p.startsWith('/') ? p : `${root}/${p}`);
  return {
    exists: (p) => io.exists(at(p)),
    readText: (p) => io.readText(at(p)),
    writeText: (p, content) => io.writeText(at(p), content),
    rename: (from, to) => io.rename(at(from), at(to)),
    listDir: (p) => io.listDir(at(p)),
  };
}

/** r69: worktree path currently holding <branch> checked out, or null. */
function holderOfWorktree(git: GitLike, branch: string): string | null {
  for (const entry of worktreeList(git)) {
    if (entry.branch === branch) return entry.path;
  }
  return null;
}

/** Shared close-out: merge → archive rename → single archive(sdd) commit. */
function mergeRenameCommit(
  git: GitLike,
  io: FsIo,
  id: string,
  featureBranch: string,
  target: string,
  method: 'squash' | 'ff',
  today: string,
  noCommit?: boolean,
): FinalizeResult {
  const warnings: string[] = [];
  // r69: when the target branch is checked out in another worktree, `git
  // switch` there would fail outright — run every write (switch / merge /
  // rename / commit) inside the holding worktree instead.
  const here = git.runOpt(['rev-parse', '--show-toplevel']);
  const holder = holderOfWorktree(git, target);
  let execGit = git;
  let execIo = io;
  let executedIn: string | null = null;
  if (
    here !== null &&
    holder !== null &&
    holder.replace(/\/+$/u, '') !== here.replace(/\/+$/u, '')
  ) {
    if (!isCleanTree(gitAt(git, holder))) {
      throw new LifecycleError(
        `target branch \`${target}\` is held by a dirty worktree at \`${holder}\` — nothing written; ` +
          `either clean that worktree (commit/stash, or \`git worktree remove ${holder}\`) ` +
          `or merge manually: git -C ${holder} merge ${method === 'ff' ? '--ff-only' : '--squash'} ${featureBranch} && git -C ${holder} add -A && git -C ${holder} commit -m "archive(sdd): ${id}"`,
      );
    }
    execGit = gitAt(git, holder);
    execIo = ioAt(io, holder);
    executedIn = holder;
  }
  execGit.run(['switch', target]);
  const mergeArgs =
    method === 'ff' ? ['merge', '--ff-only', featureBranch] : ['merge', '--squash', featureBranch];
  if (execGit.runOpt(mergeArgs) === null) {
    execGit.runOpt(['merge', '--abort']);
    warnings.push(
      `merge ${method} failed — resolve manually, e.g. \`git merge ${method === 'ff' ? '--ff-only' : '--squash'} ${featureBranch}\``,
    );
  }

  const date = today;
  const archiveDir = `${CHANGES_DIR}/archive/${date}-${id}`;
  execIo.rename(`${CHANGES_DIR}/${id}`, archiveDir);

  if (noCommit) return { target, archiveDir, warnings, commitSubject: '', executedIn };
  execGit.run(['add', '-A']);
  const commitSubject = `archive(sdd): ${id}`;
  execGit.run(['commit', '-m', commitSubject]);
  if (executedIn !== null) {
    warnings.push(
      `this worktree still shows the pre-archive \`llmanspec/changes/${id}\` checkout (expected) — clean up with \`git worktree remove\` / \`wt remove\` when done`,
    );
  }
  return { target, archiveDir, warnings, commitSubject, executedIn };
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
    today: string;
  },
): FinalizeResult {
  const path = proposalPath(id);
  const binding = readBinding(io.readText(path));
  if (!opts.force && binding === null) {
    throw new LifecycleError(`change \`${id}\` has no branch binding — run start/attach first`);
  }
  if (!opts.force) {
    const tasksPath = `${CHANGES_DIR}/${id}/tasks.md`;
    const gate = archiveTaskGate(io.exists(tasksPath) ? io.readText(tasksPath) : null);
    if (gate.blocked) {
      throw new LifecycleError(
        [
          `archive blocked by unchecked tasks (${gate.pendingLines.length} pending)`,
          ...gate.pendingLines,
        ].join('\n'),
      );
    }
    const current = currentBranch(git);
    if (current === null || current === '')
      throw new LifecycleError(detachedHead('change archive'));
    if (current !== binding?.branch) {
      throw new LifecycleError(
        notOnBoundBranch('change archive', (binding?.branch ?? '') as string, current),
      );
    }
    if (current === defaultBranch(git)) {
      throw new LifecycleError(onDefaultBranch('change archive', current));
    }
    if (!isCleanTree(git)) throw new LifecycleError(dirtyTree('change archive'));
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

/**
 * `change diff --json` (r46): structured bound-branch summary. commitCount =
 * `merge-base(base_branch, branch)..branch` commit count — the stored
 * `base_sha` is audit-only and never participates in the range; the `base`
 * field echoes it for the v1 JSON shape.
 */
export function changeDiffInfo(git: GitLike, io: FsIo, id: string): ChangeDiffInfo {
  const binding = readBinding(io.readText(proposalPath(id)));
  if (binding === null) throw new LifecycleError(`change \`${id}\` has no branch binding`);
  const baseBranch = binding.baseBranch ?? defaultBranch(git);
  const mb = mergeBase(git, binding.branch, baseBranch);
  const count = git.runOpt(['rev-list', '--count', `${mb}..${binding.branch}`]) ?? '0';
  return { change: id, branch: binding.branch, base: binding.baseSha, commitCount: Number(count) };
}
