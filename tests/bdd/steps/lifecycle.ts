// Domain step definitions: change-lifecycle 能力 — 覆盖 r14/r15(change
// start/finalize 主链)、r31(attach 默认分支门)、r35/r36(next-id 收割与
// change new --dry-run)、r44/r45/r46(attach 重绑 / finalize --no-commit /
// diff --json)、r16(默认分支 local-first 解析矩阵)。
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, type CliResult, type TempRepo, makeTempRepo, seedChange } from './shared.ts';

bdd.given('一个已提交的临时 git 仓库含 change "{id}" 的 proposal', (ctx, id) => {
  const repo = makeTempRepo();
  seedChange(repo, id, {
    proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
    commit: 'draft',
  });
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.when('对其运行 change start', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['start结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
  } satisfies CliResult;
});

bdd.thenStep('分支 {branch} 被创建且被检出', (ctx, branch) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const current = repo.run('git', ['branch', '--show-current']).stdout.trim();
  if (current !== branch) throw new Error(`expected branch ${branch}, got ${current}`);
});

bdd.thenStep('frontmatter 含 branch 与 base_branch', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes('branch: sdd/') || !proposal.includes('base_branch: main')) {
    throw new Error(`binding keys missing in proposal:\n${proposal}`);
  }
});

bdd.given('一个已完成 start 并在特性分支有新提交的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-add-feature';
  seedChange(repo, id, {
    proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
    commit: 'draft',
  });
  repo.run('bun', [CLI, 'change', 'start', id]);
  writeFileSync(join(repo.root, 'feature.txt'), 'hello\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat: hello']);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.when('对其运行 change finalize', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'finalize', id]);
  ctx.fixtures['finalize结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies CliResult;
});

bdd.thenStep('目标分支获得单条 archive(sdd) 提交', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if (subjects[0] !== 'archive(sdd): demo-add-feature') {
    throw new Error(`expected archive close-out commit, got: ${subjects.join(' | ')}`);
  }
});

bdd.thenStep('changes 目录下只剩 archive 改名产物', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const entries = readdirSync(join(repo.root, 'llmanspec', 'changes')).toSorted();
  if (entries.length !== 1 || entries[0] !== 'archive') {
    throw new Error(`expected only archive/ under changes/, got ${entries.join(', ')}`);
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'archive'))) {
    throw new Error('archive dir missing');
  }
});

bdd.thenStep('特性分支上的变更内容出现在目标分支', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  if (!existsSync(join(repo.root, 'feature.txt'))) {
    throw new Error('feature.txt did not land on target branch');
  }
});

// ---------------------------------------------------------------------------
// r31 — change attach default-branch gate (acceptance)
// ---------------------------------------------------------------------------

interface AttachResult {
  code: number;
  stdout: string;
}

bdd.when('在默认分支上对其运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['attach结果'] = { code: result.code, stdout: result.stdout } satisfies AttachResult;
});

bdd.thenStep('attach 报错且不写绑定', (ctx) => {
  const result = ctx.fixtures['attach结果'] as AttachResult;
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (result.code === 0)
    throw new Error(`attach should have failed on default branch: ${result.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (proposal.includes('branch:'))
    throw new Error(`binding written despite gate failure:\n${proposal}`);
});

bdd.when('切到特性分支再运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  repo.run('git', ['switch', '-qc', 'feat/attach']);
  const result = repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['attach结果'] = { code: result.code, stdout: result.stdout } satisfies AttachResult;
});

bdd.thenStep('attach 绑定写入当前分支', (ctx) => {
  const result = ctx.fixtures['attach结果'] as AttachResult;
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (result.code !== 0) throw new Error(`attach failed on feature branch: ${result.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes('branch: feat/attach')) {
    throw new Error(`binding for feat/attach missing:\n${proposal}`);
  }
});

// ---------------------------------------------------------------------------
// r35/r36 — next-id number harvest + change new --dry-run (acceptance)
// ---------------------------------------------------------------------------

interface NextIdResult {
  maxNumber: number | null;
  nextNumber: number;
}

bdd.given('一个含 c10-active 与嵌套 c2620 目录的 llmanspec 树', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-nextid-'));
  const mk = (rel: string): void => {
    mkdirSync(join(root, 'llmanspec', rel), { recursive: true });
    writeFileSync(join(root, 'llmanspec', rel, 'proposal.md'), '---\ndepends_on: []\n---\nx\n');
  };
  mk('changes/c10-active');
  mkdirSync(join(root, 'llmanspec', 'delayed-changes', 'c2620-tool-x'), { recursive: true });
  ctx.fixtures['nextid工作区'] = { root };
});

bdd.when('运行 change next-id --json', (ctx) => {
  const { root } = ctx.fixtures['nextid工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'change', 'next-id', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(proc.stdout ?? '{}') as NextIdResult;
  ctx.fixtures['nextid结果'] = parsed;
});

bdd.thenStep('maxNumber 为 {n:d} 且 nextNumber 为 {m:d}', (ctx, maxN: string, nextN: string) => {
  const r = ctx.fixtures['nextid结果'] as NextIdResult;
  if (r.maxNumber !== Number(maxN) || r.nextNumber !== Number(nextN)) {
    throw new Error(`expected max=${maxN} next=${nextN}, got ${JSON.stringify(r)}`);
  }
});

bdd.given('一个已初始化的临时 llmanspec 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-dryrun-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  ctx.fixtures['dryrun工作区'] = { root };
});

bdd.when('运行 change new --from "{text}" --dry-run', (ctx, text: string) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'change', 'new', '--from', text, '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['dryrun结果'] = { out: proc.stdout ?? '', code: proc.status ?? 1 };
});

bdd.thenStep('输出派生 id 且不创建 changes 目录', (ctx) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const { out, code } = ctx.fixtures['dryrun结果'] as { out: string; code: number };
  if (code !== 0) throw new Error(`dry-run exited non-zero: ${out}`);
  if (out.trim() !== 'port-the-importer') {
    throw new Error(`expected bare derived id, got: ${out}`);
  }
  if (existsSync(join(root, 'llmanspec', 'changes'))) {
    throw new Error('dry-run created the changes directory');
  }
});

// ---------------------------------------------------------------------------
// r44/r45/r46 — attach rebind / finalize no-commit / diff json (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个已 attach 的 feature 分支仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-bind';
  seedChange(repo, id, { commit: 'draft' });
  repo.run('git', ['switch', '-qc', 'feat/bind']);
  repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.when('无 force 再次运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['attach重绑'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('报错提示已绑定', (ctx) => {
  const r = ctx.fixtures['attach重绑'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`rebind should fail without --force: ${r.stdout}`);
  if (!`${r.stdout}${r.stderr}`.includes('already attached')) {
    throw new Error(`unexpected error: ${r.stdout}${r.stderr}`);
  }
});

bdd.when('带 --force --base main 运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'attach', id, '--force', '--base', 'main']);
  ctx.fixtures['attach重绑'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('重绑成功且 base_branch 记录为 main', (ctx) => {
  const r = ctx.fixtures['attach重绑'] as { code: number; stdout: string };
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (r.code !== 0) throw new Error(`forced rebind failed: ${r.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes('base_branch: main')) throw new Error(`base_branch missing:\n${proposal}`);
});

bdd.when('运行 change finalize --no-commit', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'finalize', id, '--no-commit']);
  ctx.fixtures['finalize结果'] = { code: result.code, stdout: result.stdout };
});

bdd.thenStep('目录改名完成且工作区留有未提交改动', (ctx) => {
  const r = ctx.fixtures['finalize结果'] as { code: number; stdout: string };
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  if (r.code !== 0) throw new Error(`no-commit finalize failed: ${r.stdout}`);
  const status = repo.run('git', ['status', '--porcelain']).stdout;
  if (status === '') throw new Error('expected uncommitted close-out changes after --no-commit');
});

bdd.when('运行 change diff --json', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'diff', id, '--json']);
  ctx.fixtures['diffjson结果'] = { code: result.code, stdout: result.stdout };
});

bdd.thenStep('commitCount 为 {n:d} 且 change 与 branch 字段正确', (ctx, count: string) => {
  const r = ctx.fixtures['diffjson结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`diff --json failed: ${r.stdout}`);
  const parsed = JSON.parse(r.stdout) as { change: string; branch: string; commitCount: number };
  if (parsed.commitCount !== Number(count)) throw new Error(`commitCount ${parsed.commitCount}`);
  if (!parsed.branch.startsWith('sdd/')) throw new Error(`branch field wrong: ${parsed.branch}`);
});

// ---------------------------------------------------------------------------
// r16 — default branch local-first resolution: main → master → origin/HEAD →
// origin/* matrix via `change start`'s recorded base_branch, plus the
// all-missing error. Each phase gets a fresh repo (layout cannot be mutated
// in place: refs are cheap, re-init is honest).
// ---------------------------------------------------------------------------

interface LayoutRepoFixture {
  repo: TempRepo;
  id: string;
}

const LAYOUT_BRANCH: Record<string, string> = {
  'main+master': 'main',
  'master-only': 'master',
  'origin-head': 'devel',
  'origin-branch': 'zside',
  none: 'trunk',
};

function makeLayoutRepo(layout: string): TempRepo {
  const branch = LAYOUT_BRANCH[layout];
  if (branch === undefined) throw new Error(`unknown layout: ${layout}`);
  const root = mkdtempSync(join(tmpdir(), 'llman-baselayout-'));
  const gitRun = (args: string[]): { code: number; stdout: string; stderr: string } => {
    const proc = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
  };
  gitRun(['init', '-q', '-b', branch]);
  gitRun(['config', 'user.email', 't@t']);
  gitRun(['config', 'user.name', 't']);
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  writeFileSync(
    join(root, 'llmanspec', 'specs', 'sample.feature'),
    '# language: zh-CN\n# capability: sample\n# purpose: p\n# scope: llmanspec/\n\n功能: sample\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n',
  );
  const id = 'demo-base';
  const dir = join(root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  gitRun(['add', '-A']);
  gitRun(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  if (layout === 'main+master') gitRun(['branch', 'master']);
  if (layout === 'origin-head') {
    gitRun(['update-ref', 'refs/remotes/origin/devel', 'HEAD']);
    gitRun(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/devel']);
  }
  if (layout === 'origin-branch') {
    gitRun(['update-ref', 'refs/remotes/origin/zside', 'HEAD']);
  }
  return {
    root,
    run: (cmd, args) => {
      const proc = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
      return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
    },
  };
}

bdd.given('一个默认分支布局为 {layout} 的临时仓库', (ctx, layout) => {
  ctx.fixtures['布局仓库'] = { repo: makeLayoutRepo(layout), id: 'demo-base' };
});

bdd.when('运行 change start', (ctx) => {
  const { repo, id } = ctx.fixtures['布局仓库'] as LayoutRepoFixture;
  const result = repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['start结果'] = {
    code: result.code,
    stdout: `${result.stdout}${result.stderr}`,
  };
});

bdd.thenStep('base_branch 记录为 {branch}', (ctx, branch) => {
  const { repo, id } = ctx.fixtures['布局仓库'] as LayoutRepoFixture;
  const r = ctx.fixtures['start结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`change start failed (expected base ${branch}): ${r.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes(`base_branch: ${branch}`)) {
    throw new Error(`expected base_branch: ${branch} in:\n${proposal}`);
  }
});

bdd.thenStep('报错提示缺少默认分支', (ctx) => {
  const r = ctx.fixtures['start结果'] as { code: number; stdout: string };
  if (r.code === 0) {
    throw new Error(`change start should fail without any default branch: ${r.stdout}`);
  }
  if (!r.stdout.includes('no local main/master or origin')) {
    throw new Error(`default-branch-missing message missing: ${r.stdout}`);
  }
});

// ---------------------------------------------------------------------------
// r68 — start 分叉保真与 worktree 模式(acceptance):--worktree 建树不劫持
// 当前检出、worktree 路径与检出断言、--base 显式分叉源记录。fixture 复用
// makeTempRepo 工厂,双 worktree 经 `git worktree add` 构造(design D4)。
// ---------------------------------------------------------------------------

interface StartCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

bdd.given(
  '一个已提交的临时 git 仓库切到 {branch} 分支且含 change "{id}" 的 proposal',
  (ctx, branch: string, id: string) => {
    const repo = makeTempRepo();
    seedChange(repo, id, {
      proposal: '---\ndepends_on: []\n---\n\n## Why\nTODO\n',
      commit: 'draft',
    });
    repo.run('git', ['switch', '-qc', branch]);
    ctx.fixtures['仓库'] = { root: repo.root, repo };
    ctx.fixtures['change'] = { id };
  },
);

bdd.when('对其运行 change start --worktree', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'start', id, '--worktree']);
  ctx.fixtures['startcli结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies StartCliResult;
});

bdd.when('对其运行 change start --base {branch}', (ctx, base) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'start', id, '--base', base]);
  ctx.fixtures['startcli结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies StartCliResult;
});

bdd.thenStep('当前检出保持 {branch}', (ctx, branch: string) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['startcli结果'] as StartCliResult;
  if (r.code !== 0) throw new Error(`change start failed: ${r.stdout}${r.stderr}`);
  const current = repo.run('git', ['branch', '--show-current']).stdout.trim();
  if (current !== branch) throw new Error(`expected checkout to stay on ${branch}, got ${current}`);
});

bdd.thenStep('worktree 目录存在且检出 {branch}', (ctx, branch: string) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['startcli结果'] as StartCliResult;
  // Deterministic default layout (design D2): sibling dir named
  // <repo-basename>-<branch with '/' folded to '-'>.
  const basename = repo.root.slice(repo.root.lastIndexOf('/') + 1);
  const parent = repo.root.slice(0, repo.root.lastIndexOf('/'));
  const wtPath = join(parent, `${basename}-${branch.replaceAll('/', '-')}`);
  if (!r.stdout.includes(wtPath)) {
    throw new Error(`worktree path ${wtPath} missing in output: ${r.stdout}`);
  }
  const inWt = spawnSync('git', ['-C', wtPath, 'branch', '--show-current'], {
    encoding: 'utf8',
  });
  const checked = (inWt.stdout ?? '').trim();
  if (checked !== branch) {
    throw new Error(`worktree ${wtPath} should hold ${branch}, got ${checked}`);
  }
});

bdd.thenStep('frontmatter base_branch 记录 {branch}', (ctx, branch: string) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const r = ctx.fixtures['startcli结果'] as StartCliResult;
  if (r.code !== 0) throw new Error(`change start failed: ${r.stdout}${r.stderr}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes(`base_branch: ${branch}`)) {
    throw new Error(`expected base_branch: ${branch} in:\n${proposal}`);
  }
});

// ---------------------------------------------------------------------------
// r69 — finalize/archive worktree 感知目标执行(acceptance):目标分支被其他
// worktree 持有时持有干净 → 持有 worktree 内原地执行;持有脏 → 报错含路径
// 且零写入。双 worktree fixture:主仓库切到特性分支,`git worktree add`
// 让兄弟目录持有 main(design D4)。
// ---------------------------------------------------------------------------

interface HoldFixture {
  repo: TempRepo;
  holderPath: string;
  id: string;
}

function makeHeldTargetRepo(dirtyHolder: boolean): HoldFixture {
  const repo = makeTempRepo();
  const id = 'demo-hold';
  seedChange(repo, id, {
    proposal: '---\ndepends_on: []\n---\n\n## Why\nTODO\n',
    commit: 'draft',
  });
  repo.run('bun', [CLI, 'change', 'start', id]);
  // The holder: a sibling worktree checking out the target branch (main).
  const holderPath = `${repo.root}-holder`;
  repo.run('git', ['worktree', 'add', holderPath, 'main']);
  if (dirtyHolder) writeFileSync(join(holderPath, 'uncommitted.txt'), 'dirty\n');
  // Feature work on the bound branch inside the main checkout.
  writeFileSync(join(repo.root, 'feature.txt'), 'hello\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat: hello']);
  return { repo, holderPath, id };
}

bdd.given('一个目标分支被其他干净 worktree 持有且已完成 start 并有特性提交的临时仓库', (ctx) => {
  const fx = makeHeldTargetRepo(false);
  ctx.fixtures['持有仓库'] = fx;
  ctx.fixtures['仓库'] = { root: fx.repo.root, repo: fx.repo };
  ctx.fixtures['change'] = { id: fx.id };
});

bdd.given('一个目标分支被其他脏 worktree 持有且已完成 start 并有特性提交的临时仓库', (ctx) => {
  const fx = makeHeldTargetRepo(true);
  ctx.fixtures['持有仓库'] = fx;
  ctx.fixtures['仓库'] = { root: fx.repo.root, repo: fx.repo };
  ctx.fixtures['change'] = { id: fx.id };
});

bdd.thenStep('目标分支获得 archive 提交', (ctx) => {
  const fx = ctx.fixtures['持有仓库'] as HoldFixture;
  const r = ctx.fixtures['finalize结果'] as { exitCode: number; stdout: string; stderr?: string };
  if (r.exitCode !== 0) throw new Error(`finalize failed: ${r.stdout}${r.stderr ?? ''}`);
  const subject = fx.repo.run('git', ['log', '--format=%s', '-1', 'main']).stdout.trim();
  if (!subject.startsWith('archive(sdd):')) {
    throw new Error(`expected archive(sdd) commit on main, got: ${subject}`);
  }
});

bdd.thenStep('输出含 "{text}"', (ctx, text: string) => {
  const r = ctx.fixtures['finalize结果'] as { stdout: string };
  if (!r.stdout.includes(text)) {
    throw new Error(`expected "${text}" in finalize output: ${r.stdout}`);
  }
});

bdd.thenStep('持有 worktree 内完成归档改名与内容合并', (ctx) => {
  const fx = ctx.fixtures['持有仓库'] as HoldFixture;
  if (!existsSync(join(fx.holderPath, 'llmanspec', 'changes', 'archive'))) {
    throw new Error(`archive rename missing in holder worktree ${fx.holderPath}`);
  }
  if (existsSync(join(fx.holderPath, 'llmanspec', 'changes', fx.id))) {
    throw new Error(`changes/${fx.id} should have been renamed away in the holder worktree`);
  }
  if (!existsSync(join(fx.holderPath, 'feature.txt'))) {
    throw new Error(`feature content did not land in holder worktree ${fx.holderPath}`);
  }
});

bdd.thenStep('报错含持有 worktree 路径且目标分支无新提交', (ctx) => {
  const fx = ctx.fixtures['持有仓库'] as HoldFixture;
  const r = ctx.fixtures['finalize结果'] as { exitCode: number; stdout: string; stderr?: string };
  if (r.exitCode === 0) {
    throw new Error(`finalize should fail on dirty holder: ${r.stdout}`);
  }
  if (!`${r.stdout}${r.stderr ?? ''}`.includes(fx.holderPath)) {
    throw new Error(
      `error should contain holder path ${fx.holderPath}: ${r.stdout}${r.stderr ?? ''}`,
    );
  }
  const subject = fx.repo.run('git', ['log', '--format=%s', '-1', 'main']).stdout.trim();
  if (subject.startsWith('archive(sdd):')) {
    throw new Error(`zero-write violated: archive commit landed on main: ${subject}`);
  }
  if (!existsSync(join(fx.repo.root, 'llmanspec', 'changes', fx.id))) {
    throw new Error('zero-write violated: change dir was renamed in the current worktree');
  }
});

// ---------------------------------------------------------------------------
// r35 扩展 — next-id 跨 worktree 扫描(acceptance):扫描吸收全部关联
// worktree 各自 llmanspec/ 全树的编号;同一编号出现于多个 worktree 时
// --json warnings 给出提示。fixture 复用 makeTempRepo 工厂,关联 worktree
// 经 `git worktree add` 构造(design D3)。
// ---------------------------------------------------------------------------

interface CrossWorktreeNextId {
  code: number;
  payload: { maxNumber: number | null; nextNumber: number; warnings: string[] };
}

const writeNumberedChange = (root: string, name: string): void => {
  const dir = join(root, 'llmanspec', 'changes', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\nx\n');
};

const commitAll = (repo: TempRepo, message: string): void => {
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', message]);
};

bdd.given('一个主检出含 c10 且关联 worktree 含更高编号目录的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeNumberedChange(repo.root, 'c10-active');
  commitAll(repo, 'seed c10');
  // The side worktree gets its own branch: `main` is already checked out in
  // repo.root and git refuses a second checkout of the same branch.
  const sidePath = `${repo.root}-side`;
  const added = repo.run('git', ['worktree', 'add', '-b', 'feature/side', sidePath]);
  if (added.code !== 0) throw new Error(`worktree add failed: ${added.stderr}`);
  // worktree-local (uncommitted) higher number: only visible in the side tree.
  writeNumberedChange(sidePath, 'c2620-tool-x');
  ctx.fixtures['跨worktree'] = { root: repo.root, sidePath };
});

bdd.given('一个主检出与关联 worktree 均含相同编号目录的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  // Committed number: visible from every worktree of the repo.
  writeNumberedChange(repo.root, 'c2620-shared');
  commitAll(repo, 'seed c2620');
  const sidePath = `${repo.root}-side`;
  const added = repo.run('git', ['worktree', 'add', '-b', 'feature/side', sidePath]);
  if (added.code !== 0) throw new Error(`worktree add failed: ${added.stderr}`);
  ctx.fixtures['跨worktree'] = { root: repo.root, sidePath };
});

bdd.when('在主检出运行 change next-id --json', (ctx) => {
  const { root } = ctx.fixtures['跨worktree'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'change', 'next-id', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['跨worktree结果'] = {
    code: proc.status ?? 1,
    payload: JSON.parse(proc.stdout ?? '{}'),
  } satisfies CrossWorktreeNextId;
});

bdd.thenStep(
  '跨 worktree maxNumber 为 {n:d} 且 nextNumber 为 {m:d}',
  (ctx, maxN: string, nextN: string) => {
    const r = ctx.fixtures['跨worktree结果'] as CrossWorktreeNextId;
    if (r.code !== 0) throw new Error(`next-id exited non-zero: ${JSON.stringify(r.payload)}`);
    if (r.payload.maxNumber !== Number(maxN) || r.payload.nextNumber !== Number(nextN)) {
      throw new Error(`expected max=${maxN} next=${nextN}, got ${JSON.stringify(r.payload)}`);
    }
  },
);

bdd.thenStep('warnings 提示编号 {n:d} 出现在多个 worktree', (ctx, n: string) => {
  const r = ctx.fixtures['跨worktree结果'] as CrossWorktreeNextId;
  const hit = r.payload.warnings.find(
    (w) => w.includes(`number ${n} `) && w.includes('multiple worktrees'),
  );
  if (!hit) {
    throw new Error(
      `expected cross-worktree warning for ${n}, got: ${JSON.stringify(r.payload.warnings)}`,
    );
  }
});
