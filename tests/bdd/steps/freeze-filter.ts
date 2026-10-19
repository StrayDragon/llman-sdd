// r120 step definitions — freeze content filtering (layered gitignore) through
// the real CLI in temp workspaces, mirroring the meta-foundation freeze
// idioms. Step texts are unique per handler (the runner dispatches by
// first-match on the full step text).
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FREEZE_ARCHIVE_NAME, makeWasmSevenZip } from '@llman-sdd/core';

import { initGitRepo } from '../../helpers/spawn.ts';
import { bdd } from '../runner.ts';
import { runCli } from './shared.ts';

// Same environment guard as the other freeze batches: the 7z capability is
// the bundled 7z-wasm dependency, a missing one is a broken environment.
let bundledSevenZip: 'ok' | 'missing' = 'missing';
try {
  import.meta.resolve('7z-wasm');
  bundledSevenZip = 'ok';
} catch {
  bundledSevenZip = 'missing';
}

const guard = (scene: string): void => {
  if (bundledSevenZip !== 'ok') {
    throw new Error(`[7z 环境守卫] bundled 7z-wasm 依赖不可用——${scene} 无法执行,请先 bun install`);
  }
};

interface FilterRepo {
  /** CLI launch cwd (the resolved instance root). */
  cwd: string;
  /** Repo root holding .gitignore layers (== cwd except the git-root case). */
  root: string;
  dated: string;
}

interface CliOut {
  code: number;
  stdout: string;
  stderr: string;
}

const cli = (cwd: string, args: string[]): CliOut => {
  const proc = runCli(args, cwd);
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
};

const archivePathOf = (root: string): string =>
  join(root, 'llmanspec', 'changes', 'archive', FREEZE_ARCHIVE_NAME);

const listArchive = async (root: string): Promise<string[]> => {
  const sz = await makeWasmSevenZip({ mkdirp: (d) => mkdirSync(d, { recursive: true }) });
  return sz.listEntries(archivePathOf(root));
};

const write = (root: string, rel: string, content = 'x\n'): string => {
  const full = join(root, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
  return full;
};

// ---------------------------------------------------------------------------
// 场景 1 — root .gitignore filters build artifacts (instance-root fallback:
// the temp workspace holds no .git, so the instance root is the outermost).
// ---------------------------------------------------------------------------

bdd.given(
  '一个临时仓库,实例根本层含忽略 target/ 的 .gitignore,且某带日期归档目录内留有 research/poc/target/ 构建产物与 proposal/design 正文',
  (ctx) => {
    guard('freeze 根过滤场景');
    const root = mkdtempSync(join(tmpdir(), 'llman-sdd-r120-root-'));
    write(root, '.gitignore', 'target/\n');
    mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
    const dated = '2026-01-01-poc';
    write(root, `llmanspec/changes/archive/${dated}/proposal.md`, '# p\n');
    write(root, `llmanspec/changes/archive/${dated}/design.md`, '# d\n');
    write(root, `llmanspec/changes/archive/${dated}/research/poc/target/debug/libdemo.so`, 'so');
    ctx.fixtures['r120根过滤仓库'] = { cwd: root, root, dated } satisfies FilterRepo;
  },
);

bdd.when('在含忽略链的仓库运行 archive freeze --before 该日期', (ctx) => {
  const repo = ctx.fixtures['r120根过滤仓库'] as FilterRepo;
  ctx.fixtures['r120根过滤结果'] = cli(repo.cwd, [
    'archive',
    'freeze',
    '--before',
    '2027-01-01',
  ]) satisfies CliOut;
});

bdd.thenStep(
  '冷备条目不含 target 下任何文件且含全部正文文件,平铺卡照常生成、原目录移除,输出含排除计数',
  async (ctx) => {
    const repo = ctx.fixtures['r120根过滤仓库'] as FilterRepo;
    const res = ctx.fixtures['r120根过滤结果'] as CliOut;
    if (res.code !== 0) throw new Error(`freeze failed: ${res.stdout}${res.stderr}`);
    if (!/Excluded \d+ ignored file\(s\)/u.test(res.stdout)) {
      throw new Error(`exclusion summary missing from freeze output:\n${res.stdout}`);
    }
    const entries = await listArchive(repo.cwd);
    const want = [`${repo.dated}/proposal.md`, `${repo.dated}/design.md`];
    for (const w of want) {
      if (!entries.includes(w)) throw new Error(`body entry missing from cold backup: ${w}`);
    }
    if (entries.some((e) => e.includes('/target/'))) {
      throw new Error(
        `ignored target/ artifacts leaked into the cold backup:\n${entries.join('\n')}`,
      );
    }
    const archiveDir = join(repo.root, 'llmanspec', 'changes', 'archive');
    if (!existsSync(join(archiveDir, `${repo.dated}.yaml`))) throw new Error('flat card missing');
    if (existsSync(join(archiveDir, repo.dated))) throw new Error('frozen dir not removed');
  },
);

// ---------------------------------------------------------------------------
// 场景 2 — layered evaluation: nested anchored /target + project-root rules
// discovered upward from a sub-directory instance root (git repo present).
// ---------------------------------------------------------------------------

bdd.given(
  '一个 git 仓库,其根 .gitignore 忽略 node_modules/,实例根位于子目录,某归档目录内含 research/poc/ 自带锚定忽略 /target 的 .gitignore 及 target 与 node_modules 产物',
  (ctx) => {
    guard('freeze 层叠场景');
    const root = mkdtempSync(join(tmpdir(), 'llman-sdd-r120-layered-'));
    initGitRepo(root);
    write(root, '.gitignore', 'node_modules/\n');
    const instance = join(root, 'sub');
    mkdirSync(join(instance, 'llmanspec', 'specs'), { recursive: true });
    const dated = '2026-01-01-nested';
    write(instance, `llmanspec/changes/archive/${dated}/proposal.md`, '# p\n');
    write(instance, `llmanspec/changes/archive/${dated}/research/poc/.gitignore`, '/target\n');
    write(instance, `llmanspec/changes/archive/${dated}/research/poc/target/debug/x.so`, 'so');
    write(instance, `llmanspec/changes/archive/${dated}/node_modules/pkg/i.js`, 'j');
    ctx.fixtures['r120层叠仓库'] = { cwd: instance, root, dated } satisfies FilterRepo;
  },
);

bdd.when('在实例根运行 archive freeze', (ctx) => {
  const repo = ctx.fixtures['r120层叠仓库'] as FilterRepo;
  ctx.fixtures['r120层叠结果'] = cli(repo.cwd, ['archive', 'freeze']) satisfies CliOut;
});

bdd.thenStep('嵌套 target 与 node_modules 均不入包而正文文件入包', async (ctx) => {
  const repo = ctx.fixtures['r120层叠仓库'] as FilterRepo;
  const res = ctx.fixtures['r120层叠结果'] as CliOut;
  if (res.code !== 0) throw new Error(`freeze failed: ${res.stdout}${res.stderr}`);
  const entries = await listArchive(repo.cwd);
  if (!entries.includes(`${repo.dated}/proposal.md`)) {
    throw new Error(`body entry missing from cold backup:\n${entries.join('\n')}`);
  }
  const leaked = entries.filter((e) => e.includes('/target/') || e.includes('/node_modules/'));
  if (leaked.length > 0) {
    throw new Error(`ignored artifacts leaked into the cold backup:\n${leaked.join('\n')}`);
  }
});

// ---------------------------------------------------------------------------
// 场景 3 — --ignore-file has the highest precedence (beats a decisive `!`
// re-inclusion in the repo .gitignore).
// ---------------------------------------------------------------------------

bdd.given(
  '一个临时仓库,其 .gitignore 以 ! 回含 *.bin,另备一份忽略 *.bin 的 gitignore 格式文件',
  (ctx) => {
    guard('freeze ignore-file 场景');
    const root = mkdtempSync(join(tmpdir(), 'llman-sdd-r120-userfile-'));
    write(root, '.gitignore', '*.bin\n!*.bin\n');
    const extras = write(root, 'extra.rules', '*.bin\n');
    mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
    const dated = '2026-01-01-bins';
    write(root, `llmanspec/changes/archive/${dated}/a.bin`, 'bin');
    write(root, `llmanspec/changes/archive/${dated}/keep.md`, 'k\n');
    ctx.fixtures['r120用户文件仓库'] = {
      cwd: root,
      root,
      dated,
      extras,
    } satisfies FilterRepo & { extras: string };
  },
);

bdd.when('运行 archive freeze --ignore-file 该文件', (ctx) => {
  const repo = ctx.fixtures['r120用户文件仓库'] as FilterRepo & { extras: string };
  ctx.fixtures['r120用户文件结果'] = cli(repo.cwd, [
    'archive',
    'freeze',
    '--ignore-file',
    repo.extras,
  ]) satisfies CliOut;
});

bdd.thenStep('归档目录内的 .bin 文件不入包而其余正文入包', async (ctx) => {
  const repo = ctx.fixtures['r120用户文件仓库'] as FilterRepo;
  const res = ctx.fixtures['r120用户文件结果'] as CliOut;
  if (res.code !== 0) throw new Error(`freeze failed: ${res.stdout}${res.stderr}`);
  const entries = await listArchive(repo.cwd);
  if (!entries.includes(`${repo.dated}/keep.md`)) {
    throw new Error(`body entry missing from cold backup:\n${entries.join('\n')}`);
  }
  if (entries.some((e) => e.endsWith('.bin'))) {
    throw new Error(`--ignore-file exclusion leaked .bin entries:\n${entries.join('\n')}`);
  }
});

// ---------------------------------------------------------------------------
// 场景 4 — nonexistent --ignore-file aborts with zero workspace mutation.
// ---------------------------------------------------------------------------

bdd.given('一个带日期归档目录完好而所指忽略文件缺失的临时仓库', (ctx) => {
  guard('freeze ignore-file 缺失场景');
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-r120-missing-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  const dated = '2026-01-01-keepme';
  write(root, `llmanspec/changes/archive/${dated}/proposal.md`, '# p\n');
  ctx.fixtures['r120缺失文件仓库'] = {
    cwd: root,
    root,
    dated,
    missing: join(root, 'definitely-missing.gitignore'),
  } satisfies FilterRepo & { missing: string };
});

bdd.when('运行 archive freeze --ignore-file 不存在的路径', (ctx) => {
  const repo = ctx.fixtures['r120缺失文件仓库'] as FilterRepo & { missing: string };
  ctx.fixtures['r120缺失文件结果'] = cli(repo.cwd, [
    'archive',
    'freeze',
    '--ignore-file',
    repo.missing,
  ]) satisfies CliOut;
});

bdd.thenStep('报错退出且未写平铺卡、原目录保留', (ctx) => {
  const repo = ctx.fixtures['r120缺失文件仓库'] as FilterRepo;
  const res = ctx.fixtures['r120缺失文件结果'] as CliOut;
  if (res.code === 0) throw new Error('freeze must fail on a nonexistent --ignore-file');
  if (!`${res.stdout}${res.stderr}`.includes('ignore file not found')) {
    throw new Error(`error output lacks the domain message:\n${res.stdout}${res.stderr}`);
  }
  const archiveDir = join(repo.root, 'llmanspec', 'changes', 'archive');
  if (!existsSync(join(archiveDir, repo.dated))) throw new Error('candidate dir was mutated');
  if (existsSync(join(archiveDir, `${repo.dated}.yaml`))) throw new Error('flat card was written');
  if (existsSync(archivePathOf(repo.root))) throw new Error('cold backup was written');
});

// ---------------------------------------------------------------------------
// 场景 5 — filtered cold backup thaws back to the filtered set (r120 × r25).
// ---------------------------------------------------------------------------

bdd.given('一个已完成含排除过滤 freeze 的临时仓库', (ctx) => {
  guard('freeze 过滤解冻场景');
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-r120-thaw-'));
  write(root, '.gitignore', 'target/\n');
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  const dated = '2026-01-01-roundtrip';
  write(root, `llmanspec/changes/archive/${dated}/proposal.md`, '# p\n');
  write(root, `llmanspec/changes/archive/${dated}/research/keep.md`, 'k\n');
  write(root, `llmanspec/changes/archive/${dated}/research/poc/target/debug/a.so`, 'so');
  const frozen = cli(root, ['archive', 'freeze']);
  if (frozen.code !== 0) {
    throw new Error(`freeze setup failed: ${frozen.stdout}${frozen.stderr}`);
  }
  ctx.fixtures['r120解冻仓库'] = { cwd: root, root, dated } satisfies FilterRepo;
});

bdd.when('运行 archive thaw --change 该条目', (ctx) => {
  const repo = ctx.fixtures['r120解冻仓库'] as FilterRepo;
  ctx.fixtures['r120解冻结果'] = cli(repo.cwd, [
    'archive',
    'thaw',
    '--change',
    repo.dated,
  ]) satisfies CliOut;
});

bdd.thenStep('目录回置且内容为过滤后集合(正文在、被忽略产物不在)且平铺卡删除', (ctx) => {
  const repo = ctx.fixtures['r120解冻仓库'] as FilterRepo;
  const res = ctx.fixtures['r120解冻结果'] as CliOut;
  if (res.code !== 0) throw new Error(`thaw failed: ${res.stdout}${res.stderr}`);
  const back = join(repo.root, 'llmanspec', 'changes', 'archive', repo.dated);
  if (!existsSync(join(back, 'proposal.md'))) throw new Error('proposal.md not thawed');
  if (!existsSync(join(back, 'research', 'keep.md')))
    throw new Error('research/keep.md not thawed');
  if (existsSync(join(back, 'research', 'poc'))) throw new Error('ignored target/ artifact thawed');
  if (existsSync(join(repo.root, 'llmanspec', 'changes', 'archive', `${repo.dated}.yaml`))) {
    throw new Error('flat card survived thaw');
  }
});
