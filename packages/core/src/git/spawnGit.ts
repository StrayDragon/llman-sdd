/**
 * Git subprocess adapter (change-lifecycle capability). Domain logic depends
 * on the GitLike port; this module is the concrete spawn-based implementation
 * (node:child_process — dual-runtime compliant per AGENTS.md).
 */
import { spawnSync } from 'node:child_process';

export class GitError extends Error {
  readonly args: string[];
  readonly stderr: string;

  constructor(args: string[], stderr: string) {
    super(`git ${args.join(' ')} failed: ${stderr.trim()}`);
    this.name = 'GitError';
    this.args = args;
    this.stderr = stderr;
  }
}

export interface GitLike {
  /** Run git, return stdout; throw GitError on non-zero exit. */
  run(args: string[]): string;
  /** Run git, return stdout or null on non-zero exit (probes). */
  runOpt(args: string[]): string | null;
}

export function makeSpawnGit(cwd: string): GitLike {
  const spawn = (args: string[]): { code: number; stdout: string; stderr: string } => {
    const proc = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return {
      code: proc.status ?? 1,
      stdout: proc.stdout ?? '',
      stderr: proc.stderr ?? '',
    };
  };
  return {
    run(args: string[]): string {
      const r = spawn(args);
      if (r.code !== 0) throw new GitError(args, r.stderr);
      return r.stdout.trim();
    },
    runOpt(args: string[]): string | null {
      const r = spawn(args);
      return r.code === 0 ? r.stdout.trim() : null;
    },
  };
}

export function currentBranch(git: GitLike): string | null {
  return git.runOpt(['branch', '--show-current']);
}

export function isCleanTree(git: GitLike): boolean {
  return git.run(['status', '--porcelain']) === '';
}

/** Local-first default branch resolution: main → master → origin/HEAD → origin/*. */
// Deliberately NOT shared with defaultBranchNameFn() in validation/staleness.ts
// (that probe is local-only with a 'main' fallback — v1 staleness parity). Do not merge.
export function defaultBranch(git: GitLike): string {
  for (const candidate of ['main', 'master']) {
    if (git.runOpt(['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`]) !== null) {
      return candidate;
    }
  }
  const originHead = git.runOpt(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (originHead !== null) {
    const branch = originHead.replace(/^origin\//u, '');
    if (branch !== originHead && branch !== '') return branch;
  }
  for (const ref of git.runOpt(['branch', '--remote', '--format=%(refname:short)'])?.split('\n') ??
    []) {
    if (ref.startsWith('origin/')) return ref.slice('origin/'.length);
  }
  throw new GitError(
    ['default-branch-resolution'],
    'no local main/master or origin/* branch found',
  );
}

export function revParseHead(git: GitLike): string {
  return git.run(['rev-parse', 'HEAD']);
}

/** Count uncommitted files (v1 "dirty tree: N uncommitted files"). */
export function dirtyCount(git: GitLike): number {
  const s = git.run(['status', '--porcelain']);
  if (s === '') return 0;
  return s.split('\n').filter((l) => l.trim() !== '').length;
}

/** Fork-point sha of `current` relative to `other` (v1 merge-base semantics). */
export function mergeBase(git: GitLike, current: string, other: string): string {
  return git.runOpt(['merge-base', current, other]) ?? git.run(['rev-parse', current]);
}

export interface WorktreeEntry {
  /** Absolute worktree path as reported by `git worktree list --porcelain`. */
  path: string;
  head: string | null;
  /** Checked-out local branch (`refs/heads/` stripped); null when detached/bare. */
  branch: string | null;
}

/** Parse `git worktree list --porcelain` into entries (r69 held-target detection). */
export function worktreeList(git: GitLike): WorktreeEntry[] {
  const out = git.run(['worktree', 'list', '--porcelain']);
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current !== null) entries.push(current);
      current = { path: line.slice('worktree '.length), head: null, branch: null };
    } else if (current === null) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//u, '');
    }
    // `detached` / `bare` marker lines leave branch null on purpose.
  }
  if (current !== null) entries.push(current);
  return entries;
}

export interface MainCheckoutProbe {
  /** Resolved default branch name (local-first main → master → origin/*). */
  defaultBranch: string | null;
  /** Absolute path of the executing worktree; null when unresolvable. */
  here: string | null;
  /**
   * Absolute path of the worktree holding the default branch (the main
   * checkout); null when no worktree holds it.
   */
  main: string | null;
}

/**
 * r24: best-effort main-checkout probe — the main checkout is the worktree
 * holding the default branch. Any git failure (no resolvable default branch,
 * worktree list failure, outside a repo) yields nulls so callers skip the
 * warning instead of failing the command.
 */
export function probeMainCheckout(git: GitLike): MainCheckoutProbe {
  try {
    const def = defaultBranch(git);
    const here = git.runOpt(['rev-parse', '--show-toplevel']);
    let main: string | null = null;
    for (const entry of worktreeList(git)) {
      if (entry.branch === def) {
        main = entry.path;
        break;
      }
    }
    const norm = (p: string | null): string | null => (p === null ? null : p.replace(/\/+$/u, ''));
    return { defaultBranch: def, here: norm(here), main: norm(main) };
  } catch {
    return { defaultBranch: null, here: null, main: null };
  }
}

/**
 * r24: freeze/thaw warning line when executed outside the main checkout —
 * names the non-main checkout, the possibly-incomplete cold backup, and the
 * main-checkout recommendation; null when at the main checkout or when the
 * probe could not resolve the executing worktree at all.
 */
export function nonMainCheckoutWarning(probe: MainCheckoutProbe): string | null {
  if (probe.here === null || probe.here === probe.main) return null;
  const mainDesc =
    probe.main !== null
      ? probe.main
      : 'not checked out in any worktree (cannot return to a main checkout)';
  return (
    `WARNING: this is a non-main checkout (${probe.here}); the main checkout holding ` +
    `\`${probe.defaultBranch ?? '<unknown>'}\` is: ${mainDesc} — the cold backup may be ` +
    'incomplete and freeze/thaw effects are only visible in this worktree; ' +
    'prefer running freeze/thaw from the main checkout'
  );
}
