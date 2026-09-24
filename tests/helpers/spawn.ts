/**
 * Shared subprocess helpers: the in-repo CLI entry, a `bun <cli>` runner, and
 * the temp git repo bootstrap (init + repo-local identity).
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dirname, '..', '..');
export const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

/** Run the in-repo CLI (`bun apps/cli/src/main.ts ...`); returns the raw spawn result. */
export function runCli(
  args: string[],
  cwd: string = REPO_ROOT,
  env?: NodeJS.ProcessEnv,
): SpawnSyncReturns<string> {
  return spawnSync('bun', [CLI, ...args], { cwd, encoding: 'utf8', env });
}

/** `git init` on `branch` with a repo-local identity (CI runners have no global one). */
export function initGitRepo(root: string, branch = 'main'): void {
  for (const args of [
    ['init', '-q', '-b', branch],
    ['config', 'user.email', 't@t'],
    ['config', 'user.name', 't'],
  ]) {
    spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  }
}
