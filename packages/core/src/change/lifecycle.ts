import { createHash } from 'node:crypto';

import {
  currentBranch,
  defaultBranch,
  dirtyCount,
  isCleanTree,
  localBranchExists,
  mergeBase,
  probeForkSource,
  revParseHead,
  worktreeList,
  type GitLike,
} from '../git/spawnGit.ts';
import { type FsPort } from '../util/fsPort.ts';
import {
  extractFrontmatter,
  readBinding,
  readNeedsSpecsChange,
  DEFAULT_SPECS_PREFIX,
  specsLanded,
  writeBinding,
  type ChangeBinding,
} from './frontmatter.ts';
/**
 * Change lifecycle (change-lifecycle capability): new / start / attach /
 * finalize with the predecessor git-native contract (r14-r16). All effects flow
 * through the injected GitLike and FsIo ports — this module stays pure.
 * FsIo paths are ROOT-RELATIVE (e.g. `llmanspec/changes/<id>/proposal.md`);
 * the git cwd binding lives in the GitLike adapter.
 */
import { DRAFT_PROPOSAL_TEMPLATE, deriveChangeId } from './id.ts';
import { CLOSE_OUT_TASK_HINT, closeOutTaskLines, parseTaskCheckboxes } from './tasks.ts';

export type FsIo = Pick<FsPort, 'exists' | 'readText' | 'writeText' | 'rename' | 'listDir'>;

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
/** Instance-relative live-specs dir (single SSOT with CHANGES_DIR). */
export const SPECS_DIR = 'llmanspec/specs';
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
  // r99: skeleton carries a non-empty title placeholder so a fresh draft
  // passes the title gate; agents rewrite it when filling the proposal.
  io.writeText(path, `---\ndepends_on: []\ntitle: TODO\n---\n\n${DRAFT_PROPOSAL_TEMPLATE}`);
  return { id, path };
}

export interface StartResult {
  branch: string;
  baseBranch: string;
  /** Where the recorded base_branch came from (r95 deviation warning input). */
  baseSource: 'flag' | 'worktree' | 'default';
  baseSha: string;
  /** Absolute worktree path when started with --worktree (r68); undefined on the classic path. */
  worktreePath?: string;
}

/** r95: where attach's recorded base_branch came from. */
export type AttachBaseSource = 'flag' | 'config' | 'upstream' | 'default';

export interface AttachResult {
  branch: string;
  baseBranch: string;
  baseSource: AttachBaseSource;
  baseSha: string;
}

/** r95: shared --base gate — local branches only (finalize cannot switch to a
 * remote-tracking ref; recording one is an end-to-end dead end). */
function assertLocalBase(
  git: GitLike,
  base: string,
  forbidden: string,
  kind: 'new' | 'bound',
): void {
  if (!localBranchExists(git, base)) {
    throw new LifecycleError(
      `base branch \`${base}\` does not exist as a local branch; --base must name a local branch ` +
        '(remote-tracking refs are rejected — use the local branch name)',
    );
  }
  if (base === forbidden) {
    throw new LifecycleError(`--base must differ from the ${kind} branch \`${forbidden}\``);
  }
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
  // git rev-parse --show-toplevel emits forward-slash paths even on win32
  // (git-for-Windows normalizes) — POSIX by contract; keep '/'-splitting.
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
    assertLocalBase(git, opts.base, branch, 'new');
  }

  // r68 fork-source resolution: --base explicit > current branch (worktree
  // mode records the actual source, which may be a non-default branch) >
  // default branch. The classic path keeps the r14 default-branch gate.
  let baseBranch: string;
  let baseSource: StartResult['baseSource'];
  if (opts.base !== undefined) {
    baseBranch = opts.base;
    baseSource = 'flag';
  } else if (opts.worktree) {
    baseBranch = here;
    baseSource = 'worktree';
  } else {
    baseBranch = defaultBranch(git);
    baseSource = 'default';
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
    return { branch, baseBranch, baseSource, baseSha, worktreePath };
  }
  git.run(['switch', '-c', branch]);
  const baseSha =
    currentBranch(git) !== null ? mergeBase(git, 'HEAD', baseBranch) : revParseHead(git);
  io.writeText(path, writeBinding(io.readText(path), { branch, baseBranch, baseSha }));
  return { branch, baseBranch, baseSource, baseSha };
}

/** `change attach`: bind the current branch — same branch gate family as start (r31). */
export function attachChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: { force?: boolean; base?: string } = {},
): AttachResult {
  const path = proposalPath(id);
  if (!io.exists(path)) throw new LifecycleError(`proposal not found: ${path}`);
  const existing = readBinding(io.readText(path));
  if (!opts.force && existing !== null) {
    throw new LifecycleError(
      `change \`${id}\` already attached to branch \`${existing.branch}\` (base ${existing.baseSha}); pass --force to rebind`,
    );
  }
  const branch = currentBranch(git);
  if (branch === null || branch === '') {
    throw new LifecycleError(detachedHead('change attach'));
  }
  if (opts.base !== undefined) {
    assertLocalBase(git, opts.base, branch, 'bound');
  }
  // r95 fork-source resolution: --base explicit > probeForkSource
  // (branch.<name>.base > local upstream) > default branch. No signal means
  // status quo (issue #7 compatibility: "无法推导维持现状").
  const fork =
    opts.base !== undefined
      ? { branch: opts.base, source: 'flag' as const }
      : (probeForkSource(git, branch) ?? {
          branch: defaultBranch(git),
          source: 'default' as const,
        });
  if (branch === fork.branch) {
    throw new LifecycleError(
      `${onDefaultBranch('change attach', branch)}; create or switch to a feature branch, or use \`change start\``,
    );
  }
  const baseSha = mergeBase(git, branch, fork.branch);
  io.writeText(path, writeBinding(io.readText(path), { branch, baseBranch: fork.branch, baseSha }));
  return { branch, baseBranch: fork.branch, baseSource: fork.source, baseSha };
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

/**
 * T34 close-out gate (decision D): seal-off requires the specs-landed verdict
 * (`specsLanded || !needsSpecsChange`) plus every checked task when tasks.md
 * exists. `reason === null` means pass; otherwise it is the human message.
 * Zero-write: callers run this before any merge/rename/commit.
 */
export function closeOutGate(change: {
  git: GitLike;
  io: FsIo;
  id: string;
  binding: ChangeBinding | null;
  /** r119: instance-relative specs prefix of the change's own root. */
  specsPrefix?: string;
}): { ok: boolean; reason: string | null } {
  const { git, io, id, binding } = change;
  const specsPrefix = change.specsPrefix ?? DEFAULT_SPECS_PREFIX;
  // task gate first: the unchecked list is the most actionable feedback and
  // keeps the predecessor "blocked by unchecked tasks" surface primary.
  const tasksPath = `${CHANGES_DIR}/${id}/tasks.md`;
  const gate = archiveTaskGate(io.exists(tasksPath) ? io.readText(tasksPath) : null);
  if (gate.blocked) {
    const closeOutLines = closeOutTaskLines(gate.pendingLines);
    return {
      ok: false,
      reason: [
        `close-out blocked by unchecked tasks (${gate.pendingLines.length} pending)`,
        ...gate.pendingLines,
        ...(closeOutLines.length > 0
          ? [
              `task "${closeOutLines[0]?.replace(/^-\s+\[ \]\s*/u, '').trim() ?? ''}" looks like a close-out step; ${CLOSE_OUT_TASK_HINT}`,
            ]
          : []),
      ].join('\n'),
    };
  }
  const proposal = io.readText(`${CHANGES_DIR}/${id}/proposal.md`);
  const needsSpecsChange = readNeedsSpecsChange(extractFrontmatter(proposal));
  if (binding !== null) {
    const landed = specsLanded(git, binding, specsPrefix);
    if (!landed && needsSpecsChange) {
      return {
        ok: false,
        reason: `close-out blocked: no changes under ${specsPrefix} on the bound branch (or set needs_specs_change to false)`,
      };
    }
  }
  return { ok: true, reason: null };
}

/** `change finalize`: merge (squash default) + archive rename + close-out commit. */
export function finalizeChange(
  git: GitLike,
  io: FsIo,
  id: string,
  opts: {
    into?: string;
    method?: 'squash' | 'ff';
    today: string;
    noCommit?: boolean;
    /** r119: instance-relative specs prefix of the change's own root. */
    specsPrefix?: string;
  },
): FinalizeResult {
  const path = proposalPath(id);
  const binding = readBinding(io.readText(path));
  if (binding === null) {
    throw new LifecycleError(`change \`${id}\` has no branch binding — run start/attach first`);
  }
  // T34 close-out gate before any write: specs-landed verdict + task gate.
  const closeOut = closeOutGate({ git, io, id, binding, specsPrefix: opts.specsPrefix });
  if (!closeOut.ok) {
    throw new LifecycleError(closeOut.reason as string);
  }
  // r40 unchecked-task detail lines (D9 close-out pseudo-task hint).
  const tasksPath = `${CHANGES_DIR}/${id}/tasks.md`;
  const gate = archiveTaskGate(io.exists(tasksPath) ? io.readText(tasksPath) : null);
  if (gate.blocked) {
    const closeOutLines = closeOutTaskLines(gate.pendingLines);
    throw new LifecycleError(
      [
        `finalize blocked by unchecked tasks (${gate.pendingLines.length} pending)`,
        ...gate.pendingLines,
        ...(closeOutLines.length > 0
          ? [
              `task "${closeOutLines[0]?.replace(/^-\s+\[ \]\s*/u, '').trim() ?? ''}" looks like a close-out step; ${CLOSE_OUT_TASK_HINT}`,
            ]
          : []),
      ].join('\n'),
    );
  }
  // r15 (predecessor r94): finalize runs on the bound branch — any other branch must
  // fail before any write (no switch, no merge, no rename).
  const current = currentBranch(git);
  if (current !== binding.branch) {
    throw new LifecycleError(notOnBoundBranch('change finalize', binding.branch, current));
  }
  const method = opts.method ?? 'squash';
  const target = opts.into ?? binding.baseBranch ?? defaultBranch(git);
  return mergeRenameCommit(
    git,
    io,
    id,
    binding.branch,
    target,
    method,
    opts.today,
    opts.noCommit,
    instanceDirRelFrom(opts.specsPrefix),
  );
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

/**
 * r119: instance dir relative to the git toplevel, derived from the specs
 * prefix ('llmanspec/specs/' → '', 'packages/tui/llmanspec/specs/' →
 * 'packages/tui') — the inverse of the CLI's `specsPrefixFor` derivation, so
 * the close-out redirect and the gate can never disagree.
 */
function instanceDirRelFrom(specsPrefix: string | undefined): string {
  return (specsPrefix ?? DEFAULT_SPECS_PREFIX).replace(/llmanspec\/specs\/$/u, '');
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
  /** r119: instance dir relative to the git toplevel ('' at the repo root). */
  instanceDirRel = '',
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
    // r119/W1: the io is anchored at the INSTANCE root; redirecting onto the
    // holding worktree must re-attach the instance offset relative to its
    // toplevel, or a sub-root rename would target <holder>/llmanspec (the
    // repo-root instance) and fail ENOENT mid-close-out (merge already run).
    execIo = ioAt(io, instanceDirRel === '' ? holder : `${holder}/${instanceDirRel}`);
    executedIn = holder;
  }
  // r96: in-place close-out — merging a branch into itself is always a no-op
  // ("Already up to date."), so skip the merge and say so instead of running a
  // silent self-merge. The switch still runs (a no-op when already there) so
  // escape hatches like `archive --force` from a foreign branch land the
  // rename and close-out commit on the bound branch, not the current one.
  execGit.run(['switch', target]);
  if (target === featureBranch) {
    warnings.push('in-place close-out: merge target is the bound branch itself; merge skipped');
  } else {
    const mergeArgs =
      method === 'ff'
        ? ['merge', '--ff-only', featureBranch]
        : ['merge', '--squash', featureBranch];
    if (execGit.runOpt(mergeArgs) === null) {
      execGit.runOpt(['merge', '--abort']);
      warnings.push(
        `merge ${method} failed — resolve manually, e.g. \`git merge ${method === 'ff' ? '--ff-only' : '--squash'} ${featureBranch}\``,
      );
    }
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
    /** CLI already enforced a clean tree before the acceptance command ran. */
    skipCleanTree?: boolean;
    today: string;
    /** r119: instance-relative specs prefix of the change's own root. */
    specsPrefix?: string;
  },
): FinalizeResult {
  const path = proposalPath(id);
  const binding = readBinding(io.readText(path));
  if (!opts.force && binding === null) {
    throw new LifecycleError(`change \`${id}\` has no branch binding — run start/attach first`);
  }
  if (!opts.force) {
    // T34: shared close-out verdict before any write (archive honors --force).
    const closeOut = closeOutGate({ git, io, id, binding, specsPrefix: opts.specsPrefix });
    if (!closeOut.ok) throw new LifecycleError(closeOut.reason as string);
    const tasksPath = `${CHANGES_DIR}/${id}/tasks.md`;
    const gate = archiveTaskGate(io.exists(tasksPath) ? io.readText(tasksPath) : null);
    if (gate.blocked) {
      // D9: when a pending unchecked task starts with a close-out verb, append
      // the same remediation hint as the validate WARNING (single constant).
      const closeOut = closeOutTaskLines(gate.pendingLines);
      throw new LifecycleError(
        [
          `archive blocked by unchecked tasks (${gate.pendingLines.length} pending)`,
          ...gate.pendingLines,
          ...(closeOut.length > 0
            ? [
                `task "${closeOut[0]?.replace(/^-\s+\[ \]\s*/u, '').trim() ?? ''}" looks like a close-out step; ${CLOSE_OUT_TASK_HINT}`,
              ]
            : []),
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
    if (!opts.skipCleanTree && !isCleanTree(git))
      throw new LifecycleError(dirtyTree('change archive'));
  } else if (binding === null) {
    throw new LifecycleError(`change \`${id}\` has no branch binding — cannot merge`);
  }
  const method = opts.method ?? 'squash';
  const target = opts.into ?? binding?.baseBranch ?? defaultBranch(git);
  return mergeRenameCommit(
    git,
    io,
    id,
    binding?.branch as string,
    target,
    method,
    opts.today,
    undefined,
    instanceDirRelFrom(opts.specsPrefix),
  );
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
 * field echoes it for the predecessor JSON shape.
 */
export function changeDiffInfo(git: GitLike, io: FsIo, id: string): ChangeDiffInfo {
  const binding = readBinding(io.readText(proposalPath(id)));
  if (binding === null) throw new LifecycleError(`change \`${id}\` has no branch binding`);
  const baseBranch = binding.baseBranch ?? defaultBranch(git);
  const mb = mergeBase(git, binding.branch, baseBranch);
  const count = git.runOpt(['rev-list', '--count', `${mb}..${binding.branch}`]) ?? '0';
  return { change: id, branch: binding.branch, base: binding.baseSha, commitCount: Number(count) };
}
