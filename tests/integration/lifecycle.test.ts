import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LifecycleError,
  defaultBranch,
  finalizeChange,
  isCleanTree,
  makeSpawnGit,
  newChange,
  startChange,
  type FsIo,
} from '@llman-sdd/core';

const TMP_ROOTS: string[] = [];

function mkRepo(): { root: string; git: ReturnType<typeof makeSpawnGit>; io: FsIo } {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-life-'));
  TMP_ROOTS.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  const git = makeSpawnGit(root);
  const io: FsIo = {
    exists: (p) => existsSync(join(root, p)),
    readText: (p) => readFileSync(join(root, p), 'utf8'),
    writeText: (p, c) => {
      const full = join(root, p);
      mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true });
      writeFileSync(full, c);
    },
    rename: (from, to) => {
      const target = join(root, to);
      mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true });
      renameSync(join(root, from), target);
    },
    listDir: (p) => readdirSync(join(root, p)),
  };
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
});
