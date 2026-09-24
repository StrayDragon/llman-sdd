// Shared fixtures/helpers for the domain step modules (no step registrations
// here): repo-root/CLI constants, the temp-repo factory, and the change
// seeding helper used by the lifecycle/archive/config batches.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
export const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

export interface CliResult {
  exitCode: number;
  stdout: string;
  /** Populated by steps that need to assert on error output. */
  stderr?: string;
}

export interface TempRepo {
  root: string;
  run: (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string };
}

export function makeTempRepo(): TempRepo {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-'));
  const gitRun = (args: string[]): { code: number; stdout: string; stderr: string } => {
    const proc = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
  };
  gitRun(['init', '-q', '-b', 'main']);
  // 仓库级身份:CLI 的 finalize 内部也会 commit,CI runner 无全局身份
  gitRun(['config', 'user.email', 't@t']);
  gitRun(['config', 'user.name', 't']);
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  writeFileSync(
    join(root, 'llmanspec', 'specs', 'sample.feature'),
    '# language: zh-CN\n# capability: sample\n# purpose: p\n# scope: llmanspec/\n\n功能: sample\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n',
  );
  gitRun(['add', '-A']);
  gitRun(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return {
    root,
    run: (cmd, args) => {
      // A temp repo is a fresh top-level context: when this suite itself runs
      // as a validate harness, the inherited nested-invocation guard would make
      // every harness scenario skip execution.
      const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
      const proc = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env });
      return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
    },
  };
}

/** Record-style fixture field read (fixtures stored as plain records). */
export function field(fixture: unknown, key: string): unknown {
  if (fixture !== null && typeof fixture === 'object') {
    return (fixture as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * 在临时仓库创建 llmanspec/changes/<id>/ 草稿(proposal.md + 可选附加文件);
 * 给定 commit 消息则 `git add -A` 后以仓库级身份提交。proposal 缺省为最小
 * `## Why` 草案。
 */
export function seedChange(
  repo: TempRepo,
  id: string,
  opts: { proposal?: string; files?: Record<string, string>; commit?: string } = {},
): void {
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'proposal.md'),
    opts.proposal ?? '---\ndepends_on: []\n---\n\n## Why\nx\n',
  );
  for (const [name, content] of Object.entries(opts.files ?? {})) {
    writeFileSync(join(dir, name), content);
  }
  if (opts.commit !== undefined) {
    repo.run('git', ['add', '-A']);
    repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', opts.commit]);
  }
}
