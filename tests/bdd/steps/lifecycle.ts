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
import { CLI, type CliResult, type TempRepo, makeTempRepo, seedChange, runCli } from './shared.ts';

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
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if (subjects[0] !== `archive(sdd): ${id}`) {
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
  ctx.fixtures['attach输出'] = `${result.stdout}${result.stderr}`;
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
  const proc = runCli(['change', 'next-id', '--json'], root);
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
  const proc = runCli(['change', 'new', '--from', text, '--dry-run'], root);
  ctx.fixtures['dryrun结果'] = {
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    code: proc.status ?? 1,
  };
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

// r46 — commitCount derives from merge-base(base_branch, branch), immune to
// base-branch advances and to frontmatter base_sha tampering; --export-patch
// writes the diff body to a file instead of stdout.
bdd.when('在默认分支追加 2 个提交后运行 change diff --json', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const featureBranch = repo.run('git', ['branch', '--show-current']).stdout.trim();
  repo.run('git', ['switch', 'main']);
  for (const i of [1, 2]) {
    writeFileSync(join(repo.root, `main-${i}.txt`), `advance ${i}\n`);
    repo.run('git', ['add', '-A']);
    repo.run('git', [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      'commit',
      '-qm',
      `main advance ${i}`,
    ]);
  }
  repo.run('git', ['switch', featureBranch]);
  const result = repo.run('bun', [CLI, 'change', 'diff', id, '--json']);
  ctx.fixtures['diffjson结果'] = { code: result.code, stdout: result.stdout };
});

bdd.when('把 frontmatter base_sha 改写为默认分支最新提交后运行 change diff --json', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const mainHead = repo.run('git', ['rev-parse', 'main']).stdout.trim();
  const proposalPathOf = join(repo.root, 'llmanspec', 'changes', id, 'proposal.md');
  const text = readFileSync(proposalPathOf, 'utf8');
  writeFileSync(proposalPathOf, text.replace(/^base_sha: .*$/mu, `base_sha: ${mainHead}`));
  const result = repo.run('bun', [CLI, 'change', 'diff', id, '--json']);
  ctx.fixtures['diffjson结果'] = { code: result.code, stdout: result.stdout };
  ctx.fixtures['mainhead'] = mainHead;
});

bdd.thenStep('commitCount 为 1 且 base 字段回显改写后的 base_sha', (ctx) => {
  const r = ctx.fixtures['diffjson结果'] as { code: number; stdout: string };
  const mainHead = ctx.fixtures['mainhead'] as string;
  if (r.code !== 0) throw new Error(`diff --json failed: ${r.stdout}`);
  const parsed = JSON.parse(r.stdout) as { base: string; commitCount: number };
  if (parsed.commitCount !== 1) {
    throw new Error(
      `commitCount must stay 1 despite base_sha tampering, got ${parsed.commitCount}`,
    );
  }
  if (parsed.base !== mainHead) {
    throw new Error(`base must echo the tampered base_sha ${mainHead}, got ${parsed.base}`);
  }
});

bdd.when('运行 change diff --export-patch out/change.patch', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'diff', id, '--export-patch', 'out/change.patch']);
  ctx.fixtures['diffpatch结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('out/change.patch 含特性提交的 diff 且 stdout 不含 diff 正文', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['diffpatch结果'] as { code: number; stdout: string; stderr: string };
  if (r.code !== 0) throw new Error(`diff --export-patch failed: ${r.stdout}${r.stderr}`);
  const patch = readFileSync(join(repo.root, 'out', 'change.patch'), 'utf8');
  if (!patch.includes('feature.txt') || !/^diff --git /mu.test(patch)) {
    throw new Error(`patch file lacks the feature commit diff:\n${patch}`);
  }
  if (r.stdout.includes('diff --git') || r.stdout.includes('+++')) {
    throw new Error(`stdout must not carry the diff body:\n${r.stdout}`);
  }
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
  const repo = makeTempRepo({ branch, prefix: 'llman-baselayout-' });
  seedChange(repo, 'demo-base', { commit: 'seed' });
  const git = (args: string[]): void => void repo.run('git', args);
  if (layout === 'main+master') git(['branch', 'master']);
  if (layout === 'origin-head') {
    git(['update-ref', 'refs/remotes/origin/devel', 'HEAD']);
    git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/devel']);
  }
  if (layout === 'origin-branch') {
    git(['update-ref', 'refs/remotes/origin/zside', 'HEAD']);
  }
  return repo;
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

// r68 补强 — worktree 模式的绑定落点:binding 写入新 worktree 内的 proposal,
// 发起检出保持字节不变;目标路径已存在时零写入(worktree/分支都不建)。
const worktreePathFor = (repo: TempRepo, branch: string): string => {
  const basename = repo.root.slice(repo.root.lastIndexOf('/') + 1);
  const parent = repo.root.slice(0, repo.root.lastIndexOf('/'));
  return join(parent, `${basename}-${branch.replaceAll('/', '-')}`);
};

bdd.thenStep(
  'worktree 内 frontmatter 含 branch {branch} 且 base_branch 记录 {base}',
  (ctx, branch: string, base: string) => {
    const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
    const id = (ctx.fixtures['change'] as { id: string }).id;
    const r = ctx.fixtures['startcli结果'] as StartCliResult;
    if (r.code !== 0) throw new Error(`change start failed: ${r.stdout}${r.stderr}`);
    const proposal = readFileSync(
      join(worktreePathFor(repo, branch), 'llmanspec', 'changes', id, 'proposal.md'),
      'utf8',
    );
    if (!proposal.includes(`branch: ${branch}`)) {
      throw new Error(`worktree proposal must carry branch ${branch}:\n${proposal}`);
    }
    if (!proposal.includes(`base_branch: ${base}`)) {
      throw new Error(`worktree proposal must record base_branch ${base}:\n${proposal}`);
    }
  },
);

bdd.thenStep('发起检出工作树干净且 proposal 未变', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const r = ctx.fixtures['startcli结果'] as StartCliResult;
  if (r.code !== 0) throw new Error(`change start failed: ${r.stdout}${r.stderr}`);
  const status = repo.run('git', ['status', '--porcelain']).stdout;
  if (status !== '') throw new Error(`initiating checkout must stay clean:\n${status}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (
    proposal.includes('branch:') ||
    proposal.includes('base_branch:') ||
    proposal.includes('base_sha:')
  ) {
    throw new Error(`initiating proposal must stay byte-identical (no binding keys):\n${proposal}`);
  }
});

bdd.when('预先创建其 worktree 目标目录后运行 change start --worktree', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const wtPath = worktreePathFor(repo, `sdd/${id}`);
  mkdirSync(wtPath, { recursive: true });
  ctx.fixtures['worktree前条目数'] = repo
    .run('git', ['worktree', 'list'])
    .stdout.trim()
    .split('\n').length;
  const result = repo.run('bun', [CLI, 'change', 'start', id, '--worktree']);
  ctx.fixtures['startcli结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies StartCliResult;
});

bdd.thenStep('报错含 "{text}" 且未创建分支 {branch}', (ctx, text: string, branch: string) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['startcli结果'] as StartCliResult;
  if (r.code === 0) throw new Error(`change start should have failed: ${r.stdout}${r.stderr}`);
  if (!`${r.stdout}${r.stderr}`.includes(text)) {
    throw new Error(`error must contain "${text}": ${r.stdout}${r.stderr}`);
  }
  const refExists =
    repo.run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).code === 0;
  if (refExists) throw new Error(`branch ${branch} must not be created on gate failure`);
});

bdd.thenStep('git worktree 条目数不变', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const before = ctx.fixtures['worktree前条目数'] as number;
  const after = repo.run('git', ['worktree', 'list']).stdout.trim().split('\n').length;
  if (before !== after) throw new Error(`worktree entry count changed: ${before} → ${after}`);
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
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['finalize结果'] as { exitCode: number; stdout: string; stderr?: string };
  if (r.exitCode !== 0) throw new Error(`finalize failed: ${r.stdout}${r.stderr ?? ''}`);
  const subject = repo.run('git', ['log', '--format=%s', '-1', 'main']).stdout.trim();
  if (!subject.startsWith('archive(sdd):')) {
    throw new Error(`expected archive(sdd) close-out commit on main, got: ${subject}`);
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
  const proc = runCli(['change', 'next-id', '--json'], root);
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

// ---------------------------------------------------------------------------
// T10 — lifecycle 验收补强:r14/r15/r31/r34/r35/r36/r39/r40/r44/r45/r60/r69
// ---------------------------------------------------------------------------

// r14 — start 全链路 base_sha + 门失败零写入
bdd.thenStep('frontmatter base_sha 等于默认分支与新分支的 merge-base', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const mb = repo.run('git', ['merge-base', 'main', `sdd/${id}`]).stdout.trim();
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  const m = proposal.match(/^base_sha:\s*(\S+)\s*$/mu);
  if (m?.[1] !== mb) {
    throw new Error(`base_sha ${m?.[1]} != merge-base ${mb} in:\n${proposal}`);
  }
});

bdd.when('弄脏工作树后对其运行 change start', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  writeFileSync(join(repo.root, 'wip.txt'), 'dirty\n');
  const result = repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['startcli结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies StartCliResult;
});

bdd.thenStep('proposal 内容未变', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (proposal !== '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n') {
    throw new Error(`proposal must stay byte-identical on gate failure:\n${proposal}`);
  }
});

// r15 — 非绑定分支零写入 + 合并冲突 best-effort
bdd.when('切到另一分支后运行 change finalize', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  repo.run('git', ['switch', '-qc', 'unrelated']);
  const result = repo.run('bun', [CLI, 'change', 'finalize', id]);
  ctx.fixtures['finalize结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies CliResult;
});

bdd.thenStep('报错含 "{text}" 且目标分支无新提交', (ctx, text) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const finalize = ctx.fixtures['finalize结果'] as CliResult | undefined;
  const archive = ctx.fixtures['archive结果'] as
    | { code: number; stdout: string; stderr?: string }
    | undefined;
  const r =
    finalize !== undefined
      ? { exitCode: finalize.exitCode, stdout: finalize.stdout, stderr: finalize.stderr }
      : archive !== undefined
        ? { exitCode: archive.code, stdout: archive.stdout, stderr: archive.stderr }
        : undefined;
  if (r === undefined) throw new Error('missing finalize/archive result fixture');
  if (r.exitCode === 0) throw new Error(`expected failure: ${r.stdout}${r.stderr ?? ''}`);
  if (!`${r.stdout}${r.stderr ?? ''}`.includes(text)) {
    throw new Error(`error must contain "${text}": ${r.stdout}${r.stderr ?? ''}`);
  }
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if ((subjects[0] ?? '').startsWith('archive(sdd):')) {
    throw new Error(`zero-write violated: archive commit on main: ${subjects[0]}`);
  }
});

bdd.thenStep('change 目录未被改名', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', id))) {
    throw new Error('change dir was renamed despite the failure path');
  }
});

bdd.given('一个目标分支与特性分支修改同一文件同一行的已 start 临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-conflict';
  seedChange(repo, id, {
    proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
    files: { 'shared.txt': 'base\n' },
    commit: 'draft',
  });
  repo.run('bun', [CLI, 'change', 'start', id]);
  writeFileSync(join(repo.root, 'shared.txt'), 'feature\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat side']);
  repo.run('git', ['switch', 'main']);
  writeFileSync(join(repo.root, 'shared.txt'), 'mainline\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'main side']);
  repo.run('git', ['switch', `sdd/${id}`]);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.thenStep('输出含合并冲突 WARNING 与手工命令提示', (ctx) => {
  const r = ctx.fixtures['finalize结果'] as CliResult;
  const out = `${r.stdout}${r.stderr ?? ''}`;
  if (!out.includes('[WARNING]') || !out.includes('merge squash failed')) {
    throw new Error(`merge-conflict WARNING + manual command hint missing:\n${out}`);
  }
  if (!out.includes('git merge')) {
    throw new Error(`manual merge command hint missing:\n${out}`);
  }
});

// r31 — attach 报错文案族(detached HEAD 稳定子串)
bdd.when('在 detached HEAD 上对其运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const head = repo.run('git', ['rev-parse', 'HEAD']).stdout.trim();
  repo.run('git', ['checkout', '-q', '--detach', head]);
  const result = repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['attach结果'] = { code: result.code, stdout: result.stdout } satisfies AttachResult;
  ctx.fixtures['attach输出'] = `${result.stdout}${result.stderr}`;
});

bdd.thenStep('报错含默认分支名 "{branch}" 与建议动作 "{action}"', (ctx, branch, action) => {
  const r = ctx.fixtures['attach结果'] as AttachResult;
  const out = (ctx.fixtures['attach输出'] as string | undefined) ?? r.stdout;
  if (r.code === 0) throw new Error(`attach should fail on default branch: ${out}`);
  if (!out.includes(branch) || !out.includes(action)) {
    throw new Error(`error must name ${branch} and suggest ${action}:\n${out}`);
  }
});

bdd.thenStep('报错含 "{text}" 且不写绑定', (ctx, text) => {
  const r = ctx.fixtures['attach结果'] as AttachResult;
  const out = (ctx.fixtures['attach输出'] as string | undefined) ?? r.stdout;
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (r.code === 0) throw new Error(`attach should have failed: ${out}`);
  if (!out.includes(text)) throw new Error(`error must contain "${text}": ${out}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (proposal.includes('branch:')) {
    throw new Error(`binding written despite gate failure:\n${proposal}`);
  }
});

// r34 — stage 单调推断全阶段
bdd.given(
  '一个含仅 proposal、含 design、含 design 与 tasks、已绑定四种形态 change 的临时仓库',
  (ctx) => {
    const repo = makeTempRepo();
    const mk = (id: string, files: Record<string, string>): void => {
      seedChange(repo, id, {
        proposal: '---\ndepends_on: []\n---\n\n## Why\nx\n',
        files,
      });
    };
    mk('demo-draft', {});
    mk('demo-designed', { 'design.md': '# design\n' });
    mk('demo-planned', { 'design.md': '# design\n', 'tasks.md': '# Tasks\n- [ ] t\n' });
    mk('demo-full', { 'design.md': '# design\n', 'tasks.md': '# Tasks\n- [x] t\n' });
    repo.run('git', ['add', '-A']);
    repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed']);
    repo.run('git', ['switch', '-qc', 'feat/stage']);
    repo.run('bun', [CLI, 'change', 'attach', 'demo-full']);
    ctx.fixtures['stage仓库'] = { repo };
    // Shared `运行 list --json` When reads the bare workspace fixture.
    ctx.fixtures['stage工作区'] = { root: repo.root };
  },
);

bdd.thenStep('四个 change 的 stage 依次为 draft、designed、planned、full', (ctx) => {
  const { repo } = ctx.fixtures['stage仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'list', '--json']);
  const parsed = JSON.parse(result.stdout) as { changes?: { name: string; stage: string }[] };
  const byName = new Map((parsed.changes ?? []).map((c) => [c.name, c.stage]));
  const expectStages: [string, string][] = [
    ['demo-draft', 'draft'],
    ['demo-designed', 'designed'],
    ['demo-planned', 'planned'],
    ['demo-full', 'full'],
  ];
  for (const [name, stage] of expectStages) {
    if (byName.get(name) !== stage) {
      throw new Error(`stage of ${name} must be ${stage}, got ${byName.get(name)}`);
    }
  }
});

bdd.thenStep('各 proposal 均不含 stage 字段', (ctx) => {
  const { repo } = ctx.fixtures['stage仓库'] as { repo: TempRepo };
  for (const name of ['demo-draft', 'demo-designed', 'demo-planned', 'demo-full']) {
    const proposal = readFileSync(
      join(repo.root, 'llmanspec', 'changes', name, 'proposal.md'),
      'utf8',
    );
    if (/^stage:/mu.test(proposal)) {
      throw new Error(`proposal of ${name} must not carry a stage field:\n${proposal}`);
    }
  }
});

// r35 — 纯前导数字目录不计编号
bdd.given('一个仅含 3-third 与 2026-01-01-slug 目录的 llmanspec 树', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-nextid-plain-'));
  for (const rel of ['changes/3-third', 'changes/archive/2026-01-01-slug']) {
    mkdirSync(join(root, 'llmanspec', rel), { recursive: true });
    writeFileSync(join(root, 'llmanspec', rel, 'proposal.md'), '---\ndepends_on: []\n---\nx\n');
  }
  ctx.fixtures['nextid工作区'] = { root };
});

bdd.thenStep('maxNumber 为 null 且 nextNumber 为 1', (ctx) => {
  const r = ctx.fixtures['nextid结果'] as NextIdResult;
  if (r.maxNumber !== null || r.nextNumber !== 1) {
    throw new Error(`expected max=null next=1, got ${JSON.stringify(r)}`);
  }
});

bdd.when('运行 change next-id', (ctx) => {
  const { root } = ctx.fixtures['nextid工作区'] as { root: string };
  const proc = runCli(['change', 'next-id'], root);
  ctx.fixtures['nextid人读'] = { code: proc.status ?? 1, stdout: proc.stdout ?? '' };
});

bdd.thenStep(
  'stdout 恰为 "no numbered change dirs found in tree" 与 "next free number: 1" 两行',
  (ctx) => {
    const r = ctx.fixtures['nextid人读'] as { code: number; stdout: string };
    if (r.code !== 0) throw new Error(`next-id exited non-zero: ${r.stdout}`);
    if (r.stdout.trim() !== 'no numbered change dirs found in tree\nnext free number: 1') {
      throw new Error(`unexpected human output:\n${r.stdout}`);
    }
  },
);

// r36 — dry-run 与 --from 互斥
bdd.when('同时给出 id 与 --from 并带 --dry-run 运行 change new', (ctx) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const proc = spawnSync(
    'bun',
    [CLI, 'change', 'new', 'explicit-id', '--from', 'port the importer', '--dry-run'],
    { cwd: root, encoding: 'utf8' },
  );
  ctx.fixtures['dryrun结果'] = {
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    code: proc.status ?? 1,
  };
});

bdd.thenStep('报错且不创建 changes 目录', (ctx) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const { out, code } = ctx.fixtures['dryrun结果'] as { out: string; code: number };
  if (code === 0) throw new Error(`mutually-exclusive call must fail: ${out}`);
  if (existsSync(join(root, 'llmanspec', 'changes'))) {
    throw new Error('changes directory must not be created');
  }
});

// r39 — archive 门禁与 dry-run
bdd.when('运行 change archive --dry-run', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'archive', id, '--dry-run']);
  ctx.fixtures['archive结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('输出改名计划且目标分支无新提交且 change 目录未被改名', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const r = ctx.fixtures['archive结果'] as { code: number; stdout: string; stderr: string };
  if (r.code !== 0) throw new Error(`archive --dry-run failed: ${r.stdout}${r.stderr}`);
  if (!r.stdout.includes(`llmanspec/changes/${id} -> llmanspec/changes/archive/`)) {
    throw new Error(`rename plan missing:\n${r.stdout}`);
  }
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if ((subjects[0] ?? '').startsWith('archive(sdd):')) {
    throw new Error(`dry-run must not commit: ${subjects[0]}`);
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', id))) {
    throw new Error('dry-run must not rename the change dir');
  }
});

bdd.when('弄脏工作树后运行 change archive', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  writeFileSync(join(repo.root, 'wip.txt'), 'dirty\n');
  const result = repo.run('bun', [CLI, 'change', 'archive', id]);
  ctx.fixtures['archive结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.when('清理工作树并切到默认分支后运行 change archive', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  repo.run('git', ['clean', '-fdq']);
  repo.run('git', ['switch', 'main']);
  const result = repo.run('bun', [CLI, 'change', 'archive', id]);
  ctx.fixtures['archive结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('报错且目标分支无新提交', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['archive结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`archive should fail on the default branch: ${r.stdout}`);
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if ((subjects[0] ?? '').startsWith('archive(sdd):')) {
    throw new Error(`zero-write violated: ${subjects[0]}`);
  }
});

// r40 — archive --force 跳过任务门
bdd.when('运行 change archive --force', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'archive', id, '--force']);
  ctx.fixtures['archive结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

// r44 — change new 覆盖与显式 verb(dry-run 派生前缀)
bdd.when('对已存在的 change id 运行 change new', (ctx) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  mkdirSync(join(root, 'llmanspec', 'changes', 'taken-id'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'changes', 'taken-id', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\noriginal\n',
  );
  const proc = runCli(['change', 'new', 'taken-id'], root);
  ctx.fixtures['new结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('报错含 "{text}" 且原 proposal 未变', (ctx, text) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const r = ctx.fixtures['new结果'] as { code: number; out: string };
  if (r.code === 0) throw new Error(`change new should fail on an existing id: ${r.out}`);
  if (!r.out.includes(text)) throw new Error(`error must contain "${text}":\n${r.out}`);
  const proposal = readFileSync(
    join(root, 'llmanspec', 'changes', 'taken-id', 'proposal.md'),
    'utf8',
  );
  if (proposal !== '---\ndepends_on: []\n---\n\n## Why\noriginal\n') {
    throw new Error(`original proposal must stay intact:\n${proposal}`);
  }
});

bdd.when('带 --force 再次运行 change new', (ctx) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const proc = runCli(['change', 'new', 'taken-id', '--force'], root);
  ctx.fixtures['new结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('proposal 被覆盖为骨架', (ctx) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const r = ctx.fixtures['new结果'] as { code: number; out: string };
  if (r.code !== 0) throw new Error(`--force run failed: ${r.out}`);
  const proposal = readFileSync(
    join(root, 'llmanspec', 'changes', 'taken-id', 'proposal.md'),
    'utf8',
  );
  if (proposal.includes('## Why\noriginal')) {
    throw new Error(`proposal not overwritten:\n${proposal}`);
  }
});

bdd.when('运行 change new --from "{text}" --verb fix --dry-run', (ctx, text) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const proc = spawnSync(
    'bun',
    [CLI, 'change', 'new', '--from', text, '--verb', 'fix', '--dry-run'],
    { cwd: root, encoding: 'utf8' },
  );
  ctx.fixtures['dryrun结果'] = {
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    code: proc.status ?? 1,
  };
});

bdd.thenStep('派生 id 以 "{prefix}" 开头', (ctx, prefix) => {
  const { out, code } = ctx.fixtures['dryrun结果'] as { out: string; code: number };
  if (code !== 0) throw new Error(`dry-run exited non-zero: ${out}`);
  if (!out.trim().startsWith(prefix)) {
    throw new Error(`derived id must start with "${prefix}", got: ${out}`);
  }
});

// r45 — 前缀取值序 / sweep / 合并方式
bdd.given(
  '一个已提交的临时 git 仓库含 change "{id}" 的 proposal 且 config sdd.branch_prefix 为 "{prefix}"',
  (ctx, id: string, prefix: string) => {
    const repo = makeTempRepo();
    writeFileSync(
      join(repo.root, 'llmanspec', 'config.yaml'),
      `schema: spec-driven\nsdd:\n  branch_prefix: "${prefix}"\n`,
    );
    seedChange(repo, id, {
      proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
      commit: 'draft',
    });
    ctx.fixtures['仓库'] = { root: repo.root, repo };
    ctx.fixtures['change'] = { id };
  },
);

bdd.when(
  '回到默认分支并以 --branch-prefix "{prefix}" 对新 change "{id}" 运行 change start',
  (ctx, prefix, id) => {
    const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
    repo.run('git', ['switch', 'main']);
    seedChange(repo, id, {
      proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
      commit: 'draft2',
    });
    const result = repo.run('bun', [CLI, 'change', 'start', id, '--branch-prefix', prefix]);
    ctx.fixtures['change'] = { id };
    ctx.fixtures['start结果'] = {
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    } satisfies CliResult;
  },
);

bdd.given('一个已完成 start 并在特性分支有新提交且 live specs 含种子缺陷的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-sweep';
  seedChange(repo, id, {
    proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
    commit: 'draft',
  });
  repo.run('bun', [CLI, 'change', 'start', id]);
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'broken.feature'),
    '# language: zh-CN\n# capability: broken\n# purpose: p\n# scope: llmanspec/\n\n功能: broken\n\n  @req:r1 @human @executable\n  场景: 互斥\n    - 系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat']);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.thenStep('报错含 "{text}" 且目标分支无新提交', (ctx, text) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['finalize结果'] as CliResult;
  if (r.exitCode === 0)
    throw new Error(`finalize should have failed: ${r.stdout}${r.stderr ?? ''}`);
  if (!`${r.stdout}${r.stderr ?? ''}`.includes(text)) {
    throw new Error(`output must contain "${text}": ${r.stdout}${r.stderr ?? ''}`);
  }
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if ((subjects[0] ?? '').startsWith('archive(sdd):')) {
    throw new Error(`zero-write violated: ${subjects[0]}`);
  }
});

bdd.when('运行 change finalize --no-check', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'finalize', id, '--no-check']);
  ctx.fixtures['finalize结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies CliResult;
});

bdd.given(
  '一个已完成 start 并在特性分支有两个新提交且 config sdd.merge_method 为 "{method}" 的临时仓库',
  (ctx, method: string) => {
    const repo = makeTempRepo();
    writeFileSync(
      join(repo.root, 'llmanspec', 'config.yaml'),
      `schema: spec-driven\nsdd:\n  merge_method: "${method}"\n`,
    );
    const id = 'demo-merge';
    seedChange(repo, id, {
      proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
      commit: 'draft',
    });
    repo.run('bun', [CLI, 'change', 'start', id]);
    for (const n of [1, 2]) {
      writeFileSync(join(repo.root, `feat${n}.txt`), `x${n}\n`);
      repo.run('git', ['add', '-A']);
      repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', `feat ${n}`]);
    }
    ctx.fixtures['仓库'] = { root: repo.root, repo };
    ctx.fixtures['change'] = { id };
  },
);

bdd.thenStep('目标分支包含特性分支的两个原始提交', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const r = ctx.fixtures['finalize结果'] as CliResult;
  if (r.exitCode !== 0) throw new Error(`ff finalize failed: ${r.stdout}${r.stderr ?? ''}`);
  const log = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if (!log.includes('feat 1') || !log.includes('feat 2')) {
    throw new Error(`ff merge must keep both original commits, got: ${log.join(' | ')}`);
  }
});

bdd.when('以 --method bogus 运行 change finalize', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'finalize', id, '--method', 'bogus']);
  ctx.fixtures['finalize结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies CliResult;
});

bdd.thenStep('报错含 "{text}"', (ctx, text) => {
  const finalize = ctx.fixtures['finalize结果'] as CliResult | undefined;
  const dryrun = ctx.fixtures['dryrun结果'] as { out: string; code: number } | undefined;
  const archive = ctx.fixtures['archive结果'] as
    | { code: number; stdout: string; stderr?: string }
    | undefined;
  if (finalize !== undefined) {
    const out = `${finalize.stdout}${finalize.stderr ?? ''}`;
    if (finalize.exitCode === 0) throw new Error(`expected failure: ${out}`);
    if (!out.includes(text)) throw new Error(`error must contain "${text}": ${out}`);
    return;
  }
  if (dryrun !== undefined) {
    if (dryrun.code === 0) throw new Error(`expected failure: ${dryrun.out}`);
    if (!dryrun.out.includes(text)) throw new Error(`error must contain "${text}":\n${dryrun.out}`);
    return;
  }
  if (archive !== undefined) {
    const out = `${archive.stdout}${archive.stderr ?? ''}`;
    if (archive.code === 0) throw new Error(`expected failure: ${out}`);
    if (!out.includes(text)) throw new Error(`error must contain "${text}": ${out}`);
    return;
  }
  throw new Error('missing finalize/dryrun/archive result fixture');
});

// r60 — template 未定义变量
bdd.given('一个 change_id.template 引用未定义变量 "{tpl}" 的临时仓库', (ctx, tpl) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-tpl-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'config.yaml'),
    `schema: spec-driven\nchange_id:\n  template: "${tpl}"\n`,
  );
  ctx.fixtures['dryrun工作区'] = { root };
});

bdd.thenStep('报错含 "{word}" 且不创建 changes 目录', (ctx, word) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const { out, code } = ctx.fixtures['dryrun结果'] as { out: string; code: number };
  if (code === 0) throw new Error(`render must fail on an undefined variable: ${out}`);
  if (!out.includes(word)) throw new Error(`error must mention "${word}":\n${out}`);
  if (existsSync(join(root, 'llmanspec', 'changes'))) {
    throw new Error('changes directory must not be created');
  }
});

bdd.when(
  '把 template 改为引用 "{tpl}" 后以无动词描述 "{desc}" 运行 change new --from --dry-run',
  (ctx, tpl, desc) => {
    const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
    writeFileSync(
      join(root, 'llmanspec', 'config.yaml'),
      `schema: spec-driven\nchange_id:\n  template: "x-${tpl}"\n`,
    );
    const proc = runCli(['change', 'new', '--from', desc, '--dry-run'], root);
    ctx.fixtures['dryrun结果'] = {
      out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
      code: proc.status ?? 1,
    };
  },
);

bdd.thenStep('报错含 "{word}"', (ctx, word) => {
  const { out, code } = ctx.fixtures['dryrun结果'] as { out: string; code: number };
  if (code === 0) throw new Error(`render must fail: ${out}`);
  if (!out.includes(word)) throw new Error(`error must mention "${word}":\n${out}`);
});

// r69 — 目标未被其他 worktree 持有
bdd.thenStep('输出不含 "{text}"', (ctx, text) => {
  const r = ctx.fixtures['finalize结果'] as CliResult;
  if (`${r.stdout}${r.stderr ?? ''}`.includes(text)) {
    throw new Error(`output must not contain "${text}": ${r.stdout}`);
  }
});

// align-report-cli-surface D9/B23: 收口伪任务在任务门被拒时点名(r79)。
bdd.given(
  '一个已完成 start 且 tasks.md 含未勾选任务「- [ ] T6: 收口——finalize」的临时仓库',
  (ctx) => {
    const repo = makeTempRepo();
    const id = 'demo-closeout';
    seedChange(repo, id, {
      proposal: '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n',
      files: {
        'design.md': '# design\n',
        'tasks.md': '# Tasks\n- [ ] T6: 收口——finalize\n',
      },
      commit: 'draft',
    });
    repo.run('bun', [CLI, 'change', 'start', id]);
    ctx.fixtures['仓库'] = { root: repo.root, repo };
    ctx.fixtures['change'] = { id };
  },
);

bdd.thenStep('报错列出未勾任务且含 "finalize is a pipeline step"', (ctx) => {
  const r = ctx.fixtures['finalize结果'] as CliResult;
  const out = `${r.stdout}${r.stderr ?? ''}`;
  if (r.exitCode === 0) throw new Error('finalize should be blocked by the task gate');
  if (!out.includes('T6: 收口——finalize') && !out.includes('收口——finalize')) {
    throw new Error(`pending close-out task not listed:\n${out}`);
  }
  if (!out.includes('finalize is a pipeline step')) {
    throw new Error(`pipeline-step hint missing:\n${out}`);
  }
});

bdd.thenStep('目标分支无新提交且 change 目录未被改名', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if ((subjects[0] ?? '').startsWith('archive(sdd):')) {
    throw new Error(`finalize committed despite gate: ${subjects[0]}`);
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', id))) {
    throw new Error('change dir renamed despite gate');
  }
  if (existsSync(join(repo.root, 'llmanspec', 'changes', 'archive', id))) {
    throw new Error('archive dir created despite gate');
  }
});

const EXEC_SPEC = `# language: zh-CN
# capability: tip
# purpose: p
# scope: llmanspec/

功能: tip

  @req:r9 @human
  场景: 规则
    - 计算 MUST 给出整数

  @req:r9 @executable
  场景: 跑一下
    假如 有账单
    当 计算
    那么 得到整数
`;

function seedCloseOutHarness(
  ctx: { fixtures: Record<string, unknown> },
  opts: { command: string | null; needsSpecsChange: boolean },
): void {
  const repo = makeTempRepo();
  if (opts.command !== null) {
    writeFileSync(
      join(repo.root, 'llmanspec', 'config.yaml'),
      `schema: spec-driven\nbdd:\n  run_command: "${opts.command}"\n`,
    );
  }
  writeFileSync(join(repo.root, 'llmanspec', 'specs', 'tip.feature'), EXEC_SPEC);
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'spec']);
  const id = 'demo-harness';
  const needs = opts.needsSpecsChange ? '' : 'needs_specs_change: false\n';
  seedChange(repo, id, {
    proposal: `---\ndepends_on: []\n${needs}---\n\n## Why\n\nTODO\n`,
    commit: 'draft',
  });
  repo.run('bun', [CLI, 'change', 'start', id]);
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'bind']);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
  ctx.fixtures['validate仓库'] = { repo, id };
}

bdd.given(
  '一个已完成 start、活规格含 @executable 且 run_command 写标记文件并成功的临时仓库',
  (ctx) => {
    seedCloseOutHarness(ctx, { command: 'echo ran >> .harness.log', needsSpecsChange: true });
  },
);

bdd.given(
  '一个已完成 start、活规格含 @executable 且 run_command 以退出码 1 失败的临时仓库',
  (ctx) => {
    seedCloseOutHarness(ctx, { command: 'exit 1', needsSpecsChange: true });
  },
);

bdd.given('一个已完成 start、活规格含 @executable 且未配置 run_command 的临时仓库', (ctx) => {
  seedCloseOutHarness(ctx, { command: null, needsSpecsChange: true });
});

bdd.given(
  '一个已完成 start、needs_specs_change 为 false、活规格含 @executable 且未配置 run_command 的临时仓库',
  (ctx) => {
    seedCloseOutHarness(ctx, { command: null, needsSpecsChange: false });
  },
);

bdd.when('对其运行 change archive', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'archive', id]);
  ctx.fixtures['finalize结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  } satisfies CliResult;
});

bdd.when('在设置 LLMAN_SDD_HARNESS_ACTIVE=1 的环境下运行 change finalize', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const proc = runCli(['change', 'finalize', id], repo.root, {
    ...process.env,
    LLMAN_SDD_HARNESS_ACTIVE: '1',
  });
  ctx.fixtures['finalize结果'] = {
    exitCode: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  } satisfies CliResult;
});

bdd.thenStep('标准错误含 "{text}"', (ctx, text: string) => {
  const r = ctx.fixtures['finalize结果'] as CliResult;
  if (r.exitCode !== 0) {
    throw new Error(`expected success, got ${r.exitCode}: ${r.stdout}${r.stderr ?? ''}`);
  }
  if (!(r.stderr ?? '').includes(text)) {
    throw new Error(`stderr must contain "${text}": ${r.stderr ?? ''}`);
  }
});
