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
