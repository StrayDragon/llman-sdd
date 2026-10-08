import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LifecycleError,
  archiveChange,
  attachChange,
  defaultBranch,
  finalizeChange,
  isCleanTree,
  makeSpawnGit,
  newChange,
  probeForkSource,
  startChange,
  type FsIo,
} from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';
import { initGitRepo } from '../helpers/spawn.ts';

const TMP_ROOTS: string[] = [];

function mkRepo(): { root: string; git: ReturnType<typeof makeSpawnGit>; io: FsIo } {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-life-'));
  TMP_ROOTS.push(root);
  initGitRepo(root);
  const git = makeSpawnGit(root);
  const io: FsIo = makeNodeIo(root);
  io.writeText('llmanspec/config.yaml', 'schema: spec-driven\n');
  git.run(['add', '-A']);
  git.run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init']);
  return { root, git, io };
}

afterAll(() => {
  for (const root of TMP_ROOTS) rmSync(root, { recursive: true, force: true });
});

const commitFile = (root: string, path: string, content: string, message: string): void => {
  mkdirSync(join(root, path.slice(0, path.lastIndexOf('/'))), { recursive: true });
  writeFileSync(join(root, path), content);
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', message], {
    cwd: root,
  });
};

describe('git layer', () => {
  test('defaultBranch resolves local main first', () => {
    const { git } = mkRepo();
    expect(defaultBranch(git)).toBe('main');
  });

  test('defaultBranch: init.defaultBranch preference breaks the main+master tie (r16)', () => {
    const { git } = mkRepo();
    git.run(['branch', 'master']);
    expect(defaultBranch(git)).toBe('main');
    git.run(['config', 'init.defaultBranch', 'master']);
    expect(defaultBranch(git)).toBe('master');
  });

  test('defaultBranch: init.defaultBranch is skipped when not a local branch (r16)', () => {
    const { git } = mkRepo();
    git.run(['config', 'init.defaultBranch', 'trunk']);
    expect(defaultBranch(git)).toBe('main');
  });

  test('defaultBranch: a valid preference outranks an existing local main (r16 order)', () => {
    const { git } = mkRepo();
    git.run(['branch', 'trunk']);
    git.run(['config', 'init.defaultBranch', 'trunk']);
    expect(defaultBranch(git)).toBe('trunk');
  });

  test('probeForkSource: branch.<name>.base wins; invalid value voids the signal (r95)', () => {
    const { git } = mkRepo();
    git.run(['switch', '-qc', 'topic']);
    git.run(['branch', 'feature/src']);
    expect(probeForkSource(git, 'topic')).toBeNull();
    git.run(['config', 'branch.topic.base', 'feature/src']);
    expect(probeForkSource(git, 'topic')).toEqual({ branch: 'feature/src', source: 'config' });
    git.run(['config', 'branch.topic.base', 'ghost']);
    expect(probeForkSource(git, 'topic')).toBeNull();
  });

  test('probeForkSource: local upstream (branch.<name>.remote = ".") resolves (r95)', () => {
    const { git } = mkRepo();
    git.run(['switch', '-qc', 'topic']);
    git.run(['branch', 'feature/src']);
    git.run(['branch', '--set-upstream-to=feature/src', 'topic']);
    expect(probeForkSource(git, 'topic')).toEqual({ branch: 'feature/src', source: 'upstream' });
  });

  test('probeForkSource: remote-tracking upstream is not a fork source (r95)', () => {
    const { git } = mkRepo();
    git.run(['switch', '-qc', 'topic']);
    git.run(['update-ref', 'refs/remotes/origin/topic', 'HEAD']);
    git.run(['config', 'branch.topic.remote', 'origin']);
    git.run(['config', 'branch.topic.merge', 'refs/remotes/origin/topic']);
    expect(probeForkSource(git, 'topic')).toBeNull();
  });

  test('isCleanTree false after uncommitted write', () => {
    const { root, git, io } = mkRepo();
    expect(isCleanTree(git)).toBe(true);
    io.writeText('scratch.txt', 'x');
    expect(isCleanTree(git)).toBe(false);
    void root;
  });
});

describe('lifecycle full loop', () => {
  test('new → start → finalize (squash) archive contract', () => {
    const { root, git, io } = mkRepo();
    const { id } = newChange(io, { id: 'add-demo-feature' });
    commitFile(
      root,
      `llmanspec/changes/${id}/proposal.md`,
      io.readText(`llmanspec/changes/${id}/proposal.md`),
      'docs(sdd): draft',
    );
    startChange(git, io, id);

    expect(git.run(['branch', '--show-current'])).toBe('sdd/add-demo-feature');
    const proposal = io.readText(`llmanspec/changes/${id}/proposal.md`);
    expect(proposal).toInclude('branch: sdd/add-demo-feature');
    expect(proposal).toInclude('base_branch: main');

    io.writeText('feature.txt', 'hello\n');
    git.run(['add', '-A']);
    git.run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'feat: hello']);

    const result = finalizeChange(git, io, id, { today: '2026-09-14' });
    expect(result.warnings).toHaveLength(0);
    expect(result.archiveDir).toBe('llmanspec/changes/archive/2026-09-14-add-demo-feature');
    expect(io.exists('llmanspec/changes/archive/2026-09-14-add-demo-feature/proposal.md')).toBe(
      true,
    );
    expect(io.exists(`llmanspec/changes/${id}`)).toBe(false);

    // single close-out commit on main carrying feature + docs rename
    const log = git.run(['log', '--format=%s', 'main']);
    const subjects = log.split('\n');
    expect(subjects[0]).toBe('archive(sdd): add-demo-feature');
    expect(subjects.length).toBe(3);
    expect(readFileSync(join(root, 'feature.txt'), 'utf8')).toBe('hello\n');
  });

  test('finalize ff keeps feature commits, then archives docs', () => {
    const { root, git, io } = mkRepo();
    newChange(io, { id: 'add-ff-demo' });
    commitFile(
      root,
      'llmanspec/changes/add-ff-demo/proposal.md',
      io.readText('llmanspec/changes/add-ff-demo/proposal.md'),
      'docs(sdd): draft',
    );
    startChange(git, io, 'add-ff-demo');
    commitFile(root, 'a.txt', 'A\n', 'feat: a');
    commitFile(root, 'b.txt', 'B\n', 'feat: b');

    finalizeChange(git, io, 'add-ff-demo', { method: 'ff', today: '2026-09-14' });
    const subjects = git.run(['log', '--format=%s', 'main']).split('\n');
    expect(subjects.slice(0, 3)).toEqual(['archive(sdd): add-ff-demo', 'feat: b', 'feat: a']);
  });

  test('finalize with merge conflict is best-effort: warn + archive still completes', () => {
    const { root, git, io } = mkRepo();
    newChange(io, { id: 'add-conflict' });
    commitFile(
      root,
      'llmanspec/changes/add-conflict/proposal.md',
      io.readText('llmanspec/changes/add-conflict/proposal.md'),
      'docs(sdd): draft',
    );
    startChange(git, io, 'add-conflict');
    io.writeText('shared.txt', 'from feature\n');
    git.run(['add', '-A']);
    git.run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat: feature side']);

    // conflicting change lands on main while the feature branch is out
    git.run(['switch', 'main']);
    io.writeText('shared.txt', 'from main\n');
    git.run(['add', '-A']);
    git.run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat: main side']);

    git.run(['switch', 'sdd/add-conflict']);
    const result = finalizeChange(git, io, 'add-conflict', { today: '2026-09-14' });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(io.exists('llmanspec/changes/archive/2026-09-14-add-conflict/proposal.md')).toBe(true);
    const log = git.run(['log', '--format=%s', 'main']);
    expect(log.split('\n')[0]).toBe('archive(sdd): add-conflict');
  });

  test('start gates: dirty tree and non-default branch rejected', () => {
    const { root, git, io } = mkRepo();
    newChange(io, { id: 'add-gated' });
    io.writeText('dirty.txt', 'x');
    expect(() => startChange(git, io, 'add-gated')).toThrow(LifecycleError);
    git.run(['add', '-A']);
    git.run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'dirty committed']);

    // now on main but let's move to a non-default branch
    git.run(['switch', '-c', 'other']);
    expect(() => startChange(git, io, 'add-gated')).toThrow(/default branch/);
  });

  test('finalize in-place (--into the bound branch) skips the merge and archives on the branch (r96)', () => {
    const { root, git, io } = mkRepo();
    newChange(io, { id: 'add-inplace' });
    commitFile(
      root,
      'llmanspec/changes/add-inplace/proposal.md',
      io.readText('llmanspec/changes/add-inplace/proposal.md'),
      'docs(sdd): draft',
    );
    startChange(git, io, 'add-inplace');
    io.writeText('feature.txt', 'hello\n');
    git.run(['add', '-A']);
    git.run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'feat: hello']);

    const mainHeadBefore = git.run(['rev-parse', 'main']);
    const result = finalizeChange(git, io, 'add-inplace', {
      today: '2026-10-08',
      into: 'sdd/add-inplace',
    });
    expect(result.warnings.join('\n')).toContain('in-place close-out');
    expect(git.run(['branch', '--show-current'])).toBe('sdd/add-inplace');
    expect(git.run(['log', '--format=%s', '-1', 'sdd/add-inplace'])).toBe(
      'archive(sdd): add-inplace',
    );
    // main stays untouched — the whole close-out happened on the bound branch
    expect(git.run(['rev-parse', 'main'])).toBe(mainHeadBefore);
    expect(io.exists('llmanspec/changes/archive/2026-10-08-add-inplace/proposal.md')).toBe(true);
    expect(io.exists('llmanspec/changes/add-inplace')).toBe(false);
  });

  test('archive --force in-place from a foreign branch lands the close-out on the bound branch (r96)', () => {
    const { root, git, io } = mkRepo();
    newChange(io, { id: 'force-inplace' });
    commitFile(
      root,
      'llmanspec/changes/force-inplace/proposal.md',
      io.readText('llmanspec/changes/force-inplace/proposal.md'),
      'docs(sdd): draft',
    );
    startChange(git, io, 'force-inplace');
    io.writeText('feature.txt', 'x\n');
    git.run(['add', '-A']);
    git.run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat: x']);
    git.run(['switch', '-qc', 'unrelated']);
    const result = archiveChange(git, io, 'force-inplace', {
      force: true,
      into: 'sdd/force-inplace',
      today: '2026-10-08',
    });
    expect(result.warnings.join('\n')).toContain('in-place close-out');
    expect(git.run(['branch', '--show-current'])).toBe('sdd/force-inplace');
    expect(git.run(['log', '--format=%s', '-1', 'sdd/force-inplace'])).toBe(
      'archive(sdd): force-inplace',
    );
  });
});

describe('attach fork-source derivation (r95)', () => {
  const seedAndSwitch = (
    root: string,
    git: ReturnType<typeof makeSpawnGit>,
    io: FsIo,
    id: string,
  ): void => {
    newChange(io, { id });
    commitFile(
      root,
      `llmanspec/changes/${id}/proposal.md`,
      io.readText(`llmanspec/changes/${id}/proposal.md`),
      'docs(sdd): draft',
    );
    git.run(['switch', '-qc', 'topic']);
  };

  test('no signal falls back to the default branch (status quo)', () => {
    const { root, git, io } = mkRepo();
    seedAndSwitch(root, git, io, 'derive-plain');
    const r = attachChange(git, io, 'derive-plain');
    expect(r).toMatchObject({ baseBranch: 'main', baseSource: 'default' });
  });

  test('local upstream is recorded with its source', () => {
    const { root, git, io } = mkRepo();
    seedAndSwitch(root, git, io, 'derive-up');
    git.run(['branch', 'feature/src']);
    git.run(['branch', '--set-upstream-to=feature/src', 'topic']);
    const r = attachChange(git, io, 'derive-up');
    expect(r).toMatchObject({ baseBranch: 'feature/src', baseSource: 'upstream' });
    const proposal = io.readText('llmanspec/changes/derive-up/proposal.md');
    expect(proposal).toInclude('base_branch: feature/src');
  });

  test('branch.<name>.base outranks the local upstream', () => {
    const { root, git, io } = mkRepo();
    seedAndSwitch(root, git, io, 'derive-cfg');
    git.run(['branch', 'feature/up']);
    git.run(['branch', 'release/x']);
    git.run(['branch', '--set-upstream-to=feature/up', 'topic']);
    git.run(['config', 'branch.topic.base', 'release/x']);
    const r = attachChange(git, io, 'derive-cfg');
    expect(r).toMatchObject({ baseBranch: 'release/x', baseSource: 'config' });
  });

  test('--base flag still outranks every derived signal', () => {
    const { root, git, io } = mkRepo();
    seedAndSwitch(root, git, io, 'derive-flag');
    git.run(['branch', 'release/x']);
    git.run(['config', 'branch.topic.base', 'release/x']);
    const r = attachChange(git, io, 'derive-flag', { base: 'main' });
    expect(r).toMatchObject({ baseBranch: 'main', baseSource: 'flag' });
  });
});
