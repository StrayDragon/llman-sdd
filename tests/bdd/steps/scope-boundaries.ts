// Scope-boundaries acceptance steps (subproject-namespace-scope r113-r117):
// the uniqueness domain per instance root, cross-root observability, the
// `--directory`-only disambiguation surface and the default write target.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';

import { bdd } from '../runner.ts';
import {
  CLI,
  makeTempRepo,
  runCli,
  seedChange,
  seedSubRoot,
  subRootOf,
  SUB,
  type TempRepo,
} from './shared.ts';

// 7z 环境守卫(同 meta-foundation 的依赖探测):freeze/thaw 的真实打包依赖
// 7z-wasm,缺失属环境损坏 → 快失败而非静默跳过。
let bundledSevenZip: 'ok' | 'missing' = 'missing';
try {
  import.meta.resolve('7z-wasm');
  bundledSevenZip = 'ok';
} catch {
  bundledSevenZip = 'missing';
}

// ---------------------------------------------------------------------------
// r114 — 跨根同号可观测且不阻断(t3):明细 + 计数 + human 指引行 + 退出码中性。
// ---------------------------------------------------------------------------

bdd.when('分别以 human 与 machine 形态运行 validate --all-roots', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  ctx.fixtures['跨根观测结果'] = {
    human: repo.run('bun', [CLI, 'validate', '--all-roots', '--output', 'human']),
    machine: repo.run('bun', [CLI, 'validate', '--all-roots', '--json']),
    toon: repo.run('bun', [CLI, 'validate', '--all-roots']),
  };
});

bdd.thenStep(
  '两形态都列出三类撞号明细与计数且 human 尾附 --directory 指引而 machine 不带',
  (ctx) => {
    const r = ctx.fixtures['跨根观测结果'] as {
      human: { code: number; stdout: string; stderr: string };
      machine: { code: number; stdout: string; stderr: string };
      toon: { code: number; stdout: string; stderr: string };
    };
    for (const [form, out] of Object.entries(r)) {
      if (out.code !== 0) throw new Error(`${form} 形态退出码受观测段影响: ${out.code}`);
    }
    const expected: Array<[string, string]> = [
      ['spec', 'sample'],
      ['req', 'r1'],
      ['change', 'same'],
    ];
    for (const [ns, value] of expected) {
      if (!r.human.stdout.includes(`${ns}/${value}`)) {
        throw new Error(`human 缺撞号明细 ${ns}/${value}:\n${r.human.stdout}`);
      }
    }
    const parsed = JSON.parse(r.machine.stdout) as {
      crossRootCollisions?: Array<{ namespace: string; value: string; roots: string[] }>;
      summary?: { crossRootCollisions?: number };
    };
    const got = (parsed.crossRootCollisions ?? []).map((c) => `${c.namespace}/${c.value}`);
    for (const [ns, value] of expected) {
      if (!got.includes(`${ns}/${value}`)) {
        throw new Error(`machine 缺撞号明细 ${ns}/${value}: ${JSON.stringify(got)}`);
      }
    }
    // r114 渲染顺序:先 namespace 后 value(成员断言升级为顺序单调——乱序渲染
    // 不再能凭 includes 混过)
    if (got.join('|') !== expected.map(([ns, value]) => `${ns}/${value}`).join('|')) {
      throw new Error(`machine 撞号明细渲染顺序漂移: ${JSON.stringify(got)}`);
    }
    if (parsed.summary?.crossRootCollisions !== 3) throw new Error('summary 缺撞号计数');
    // toon 同数据:明细与计数都在
    for (const need of [
      'spec',
      'sample',
      'req',
      'r1',
      'change',
      'same',
      'crossRootCollisions: 3',
    ]) {
      if (!r.toon.stdout.includes(need)) throw new Error(`toon 缺 ${need}:\n${r.toon.stdout}`);
    }
    if (!r.human.stdout.includes('--directory')) {
      throw new Error(`human 形态缺处置指引行:\n${r.human.stdout}`);
    }
    for (const form of ['machine', 'toon'] as const) {
      if (r[form].stdout.includes('Use --directory')) {
        throw new Error(`${form} 形态不得携带 human 指引行`);
      }
    }
    // 明细条目与计数汇总都是观测段独有形状,human 形态只给可读段
    if (r.human.stdout.includes('crossRootCollisions')) {
      throw new Error('human 形态不应出现 machine 字段名');
    }
  },
);

bdd.given('一个仅含单根 llmanspec 的临时仓库', (ctx) => {
  ctx.fixtures['单根仓库'] = { repo: makeTempRepo() };
});

bdd.when('在其根运行 validate --all-roots --json', (ctx) => {
  const { repo } = ctx.fixtures['单根仓库'] as { repo: TempRepo };
  ctx.fixtures['单根聚合结果'] = repo.run('bun', [CLI, 'validate', '--all-roots', '--json']);
});

bdd.thenStep('报告不含 crossRootCollisions 字段', (ctx) => {
  const r = ctx.fixtures['单根聚合结果'] as { code: number; stdout: string; stderr: string };
  if (r.code !== 0) throw new Error(`单根聚合须绿: ${r.code}\n${r.stdout}${r.stderr}`);
  if (r.stdout.includes('crossRootCollisions')) {
    throw new Error(`单根不得产出观测段(含空数组):\n${r.stdout}`);
  }
});

// ---------------------------------------------------------------------------
// r115 — 根限定一律经 --directory(t1:读侧实例根补齐)
// ---------------------------------------------------------------------------

bdd.when('在仓库根以 --directory 指向子根运行 index rebuild 与 context', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  // 显式空 chat model:走零 LLM 路径,懒重建不依赖可达 API(同 r62 场景)。
  const env: Record<string, string> = { ...process.env, LLMAN_SDD_INDEX_CHAT_MODEL: '' };
  const rebuild = runCli(['index', 'rebuild', '--directory', SUB], repo.root, env);
  // 先删子根索引,使随后的懒重建可归因于 context 本身而非前一条命令。
  rmSync(join(subRootOf(repo), 'llmanspec', '.context'), { recursive: true, force: true });
  const context = runCli(
    ['context', '--paths', 'llmanspec/specs', '--directory', SUB],
    repo.root,
    env,
  );
  ctx.fixtures['子根读侧结果'] = {
    rebuildCode: rebuild.status ?? 1,
    rebuildOut: `${rebuild.stdout ?? ''}${rebuild.stderr ?? ''}`,
    contextCode: context.status ?? 1,
    contextOut: `${context.stdout ?? ''}${context.stderr ?? ''}`,
  };
});

bdd.thenStep('索引产物只落在子根实例且根实例无索引目录', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['子根读侧结果'] as {
    rebuildCode: number;
    rebuildOut: string;
    contextCode: number;
    contextOut: string;
  };
  if (r.rebuildCode !== 0) throw new Error(`index rebuild failed: ${r.rebuildOut}`);
  if (r.contextCode !== 0) throw new Error(`context failed: ${r.contextOut}`);
  const treePath = join(subRootOf(repo), 'llmanspec', '.context', 'pageindex', 'tree.json');
  if (!existsSync(treePath)) {
    throw new Error('index store missing under the --directory instance');
  }
  const tree = JSON.parse(readFileSync(treePath, 'utf8')) as { docs: { spec_id: string }[] };
  const ids = tree.docs.map((d) => d.spec_id).join(',');
  if (!ids.includes('tuicap')) throw new Error(`sub-root capability missing from tree: ${ids}`);
  if (ids.includes('sample')) {
    throw new Error(`tree covers the launch root capability instead: ${ids}`);
  }
  if (existsSync(join(repo.root, 'llmanspec', '.context'))) {
    throw new Error('launch root received the index store');
  }
});

bdd.given('子根 specs 存在跨文件同号 req', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  writeFileSync(
    join(subRootOf(repo), 'llmanspec', 'specs', 'dupe.feature'),
    '# language: zh-CN\n# capability: dupe\n# purpose: p\n# scope: tests/\n\n功能: dupe\n\n  @req:r5\n  规则: 同号规则\n    系统 MUST z\n',
  );
});

bdd.when(
  '在仓库根运行 project dedupe-req-ids --dry-run 并限定与不限定 --directory 各一次',
  (ctx) => {
    const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
    const scoped = runCli(
      ['project', 'dedupe-req-ids', '--dry-run', '--directory', SUB],
      repo.root,
      process.env,
    );
    const unscoped = runCli(['project', 'dedupe-req-ids', '--dry-run'], repo.root, process.env);
    ctx.fixtures['注册表结果'] = {
      scopedCode: scoped.status ?? 1,
      scopedOut: `${scoped.stdout ?? ''}${scoped.stderr ?? ''}`,
      unscopedOut: `${unscoped.stdout ?? ''}${unscoped.stderr ?? ''}`,
    };
  },
);

bdd.thenStep('限定子根时报告子根冲突重映射,不限定时报根注册表无冲突', (ctx) => {
  const r = ctx.fixtures['注册表结果'] as {
    scopedCode: number;
    scopedOut: string;
    unscopedOut: string;
  };
  if (r.scopedCode !== 0) throw new Error(`scoped dedupe failed: ${r.scopedOut}`);
  // 子根内 tuicap@r5 与 dupe@r5 相交:重映射哪一侧取决于发生序,此处只断言
  // 「子根注册表内恰有一处 r5 冲突并按子根空号重映射到 r6」。
  if (!r.scopedOut.includes('r5 → r6') || !r.scopedOut.includes('1 remapping(s)')) {
    throw new Error(`sub-root remap missing:\n${r.scopedOut}`);
  }
  if (r.scopedOut.includes('No colliding')) {
    throw new Error(`sub-root registry looked empty:\n${r.scopedOut}`);
  }
  // 根实例注册表只有 sample@r1:未限定 --directory 时不得看见子根冲突
  if (!r.unscopedOut.includes('No colliding req_id values in llmanspec/specs.')) {
    throw new Error(`launch root registry must stay collision-free:\n${r.unscopedOut}`);
  }
});

const seedSubChange = (repo: TempRepo, id: string, title: string): void => {
  const dir = join(subRootOf(repo), 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'proposal.md'),
    `---\ndepends_on: []\ntitle: ${title}\n---\n\n## Why\nx\n\n## What Changes\n- y\n`,
  );
};

/** 子根 change 草案,显式声明不改合约(收口门以 !needsSpecsChange 通过)。 */
const seedSubChangeProposal = (repo: TempRepo, id: string, title: string): void => {
  const dir = join(subRootOf(repo), 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'proposal.md'),
    `---\ndepends_on: []\nneeds_specs_change: false\ntitle: ${title}\n---\n\n## Why\nx\n\n## What Changes\n- y\n`,
  );
};

bdd.given('一个根与子根各含同名 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  seedChange(repo, 'same', {
    proposal:
      '---\ndepends_on: []\ntitle: 根侧同名条目\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
  });
  seedSubChange(repo, 'same', '子根侧同名条目');
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('运行 show 复合标识符 与 show 同名 id --directory 子根', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const compound = runCli(['show', `${SUB}#same`], repo.root, process.env);
  const scoped = runCli(['show', 'same', '--directory', SUB], repo.root, process.env);
  ctx.fixtures['同名条目结果'] = {
    compoundCode: compound.status ?? 1,
    compoundOut: `${compound.stdout ?? ''}${compound.stderr ?? ''}`,
    scopedCode: scoped.status ?? 1,
    scopedOut: `${scoped.stdout ?? ''}${scoped.stderr ?? ''}`,
  };
});

bdd.thenStep('复合标识符报未找到且不解析到子根,--directory 形态解析到子根条目', (ctx) => {
  const r = ctx.fixtures['同名条目结果'] as {
    compoundCode: number;
    compoundOut: string;
    scopedCode: number;
    scopedOut: string;
  };
  if (r.compoundCode === 0) throw new Error(`compound id must not resolve:\n${r.compoundOut}`);
  if (!r.compoundOut.includes('change not found')) {
    throw new Error(`compound id must fail as a plain missing id:\n${r.compoundOut}`);
  }
  if (r.compoundOut.includes('子根侧同名条目')) {
    throw new Error(`compound id was parsed as a root qualifier:\n${r.compoundOut}`);
  }
  if (r.scopedCode !== 0) throw new Error(`scoped show failed: ${r.scopedOut}`);
  if (!r.scopedOut.includes('子根侧同名条目')) {
    throw new Error(`--directory did not select the sub-root change:\n${r.scopedOut}`);
  }
});

bdd.when('以冒号形态复合标识符分别运行 show 与 validate', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const compound = `${SUB}:same`;
  const showed = runCli(['show', compound], repo.root, process.env);
  const validated = runCli(['validate', compound], repo.root, process.env);
  ctx.fixtures['冒号复合结果'] = {
    compound,
    showed: { code: showed.status ?? 1, out: `${showed.stdout ?? ''}${showed.stderr ?? ''}` },
    validated: {
      code: validated.status ?? 1,
      out: `${validated.stdout ?? ''}${validated.stderr ?? ''}`,
    },
  };
});

bdd.thenStep('两条命令都报未找到类错误且都不解析到子根条目', (ctx) => {
  const r = ctx.fixtures['冒号复合结果'] as {
    compound: string;
    showed: { code: number; out: string };
    validated: { code: number; out: string };
  };
  for (const [name, ran] of [
    ['show', r.showed],
    ['validate', r.validated],
  ] as const) {
    if (ran.code === 0) throw new Error(`${name} 把 ${r.compound} 当成了有效 id:\n${ran.out}`);
    if (!ran.out.includes(`not found: ${r.compound}`)) {
      throw new Error(`${name} 未按普通未找到类错误失败:\n${ran.out}`);
    }
    if (ran.out.includes('子根侧同名条目')) {
      throw new Error(`${name} 把 ${r.compound} 解析成了根限定标识符:\n${ran.out}`);
    }
  }
});

// ---------------------------------------------------------------------------
// r118 — change/archive 命令的实例根解析(t2):子目录 cwd 归位最近实例根,
// 无有效实例报域错误且不就地新建。
// ---------------------------------------------------------------------------

/** 子包实例内的源码子目录(cwd 归位场景的起点)。 */
const subSrcDir = (repo: TempRepo): string => {
  const dir = join(subRootOf(repo), 'src');
  mkdirSync(dir, { recursive: true });
  return dir;
};

bdd.when('在子包源码子目录运行 change new', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const cwd = subSrcDir(repo);
  const proc = runCli(['change', 'new', 'ns-sub'], cwd, process.env);
  ctx.fixtures['子目录新建结果'] = {
    cwd,
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('proposal 落在子根实例且根实例与该子目录均无新建 llmanspec', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['子目录新建结果'] as { cwd: string; code: number; out: string };
  if (r.code !== 0) throw new Error(`change new failed from the sub-root subdir: ${r.out}`);
  // 落盘目标 = 实例根;输出仍是实例相对路径(单根时代逐字节一致)。
  if (!r.out.includes('llmanspec/changes/ns-sub/proposal.md')) {
    throw new Error(`unexpected change new output:\n${r.out}`);
  }
  if (!existsSync(join(subRootOf(repo), 'llmanspec', 'changes', 'ns-sub', 'proposal.md'))) {
    throw new Error('proposal did not land in the nearest (sub-root) instance');
  }
  if (existsSync(join(repo.root, 'llmanspec', 'changes', 'ns-sub'))) {
    throw new Error('change landed in the launch root instance instead');
  }
  if (existsSync(join(r.cwd, 'llmanspec'))) {
    throw new Error('a stray llmanspec/ was created at the cwd (r118 forbids this)');
  }
});

bdd.when('在该空目录运行 change new', (ctx) => {
  const { root } = ctx.fixtures['空目录工作区'] as { root: string };
  // 全新顶层上下文:剥离 harness 嵌套守卫(同 makeTempRepo 的 run)。
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, 'change', 'new', 'solo'], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
  ctx.fixtures['空目录新建结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('stderr 含 "no llmanspec root at or above" 且退出码为 1', (ctx) => {
  const r = ctx.fixtures['空目录新建结果'] as { code: number; out: string };
  if (r.code !== 1) throw new Error(`expected exit code 1, got ${r.code}:\n${r.out}`);
  if (!r.out.includes('no llmanspec root at or above')) {
    throw new Error(`domain error missing:\n${r.out}`);
  }
  if (r.out.includes('ENOENT')) throw new Error(`raw ENOENT leaked:\n${r.out}`);
});

bdd.thenStep('该空目录下未创建 llmanspec', (ctx) => {
  const { root } = ctx.fixtures['空目录工作区'] as { root: string };
  if (existsSync(join(root, 'llmanspec'))) {
    throw new Error('change new created llmanspec/ in an instance-less directory (r118 forbids)');
  }
});

bdd.given('一个根与子根各含编号 change 目录的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  seedChange(repo, 'c9-rootonly');
  seedSubChange(repo, 'c3-subonly', '子根编号条目');
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('分别在仓库根与子包源码子目录运行 change next-id', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const atRoot = runCli(['change', 'next-id', '--json'], repo.root, process.env);
  const atSub = runCli(['change', 'next-id', '--json'], subSrcDir(repo), process.env);
  ctx.fixtures['双根取号'] = {
    rootCode: atRoot.status ?? 1,
    rootOut: `${atRoot.stdout ?? ''}${atRoot.stderr ?? ''}`,
    subCode: atSub.status ?? 1,
    subOut: `${atSub.stdout ?? ''}${atSub.stderr ?? ''}`,
  };
});

bdd.thenStep('两次清点分别只见各自实例根下的编号目录', (ctx) => {
  const r = ctx.fixtures['双根取号'] as {
    rootCode: number;
    rootOut: string;
    subCode: number;
    subOut: string;
  };
  if (r.rootCode !== 0) throw new Error(`root next-id failed: ${r.rootOut}`);
  if (r.subCode !== 0) throw new Error(`sub-root next-id failed: ${r.subOut}`);
  const atRoot = JSON.parse(r.rootOut) as { maxNumber: number; nextNumber: number };
  const atSub = JSON.parse(r.subOut) as { maxNumber: number; nextNumber: number };
  if (atRoot.maxNumber !== 9 || atRoot.nextNumber !== 10) {
    throw new Error(`launch root harvest drifted: ${r.rootOut}`);
  }
  if (atSub.maxNumber !== 3 || atSub.nextNumber !== 4) {
    throw new Error(`sub-root harvest must stay per-instance: ${r.subOut}`);
  }
});

bdd.when('分别在仓库根与其子目录运行 change new --dry-run', (ctx) => {
  const { root } = ctx.fixtures['工作区'] as { root: string };
  const sub = join(root, 'nested');
  mkdirSync(sub, { recursive: true });
  const args = ['change', 'new', '--from', 'port the importer', '--dry-run'];
  const atRoot = runCli(args, root, process.env);
  const atSub = runCli(args, sub, process.env);
  // 子目录里的真实落盘:单根时代归位仓库根实例(零漂移的另一半)。
  const real = runCli(['change', 'new', 'ns-real'], sub, process.env);
  ctx.fixtures['单根派生对照'] = {
    rootCode: atRoot.status ?? 1,
    rootOut: atRoot.stdout ?? '',
    subCode: atSub.status ?? 1,
    subOut: atSub.stdout ?? '',
    realCode: real.status ?? 1,
    realOut: `${real.stdout ?? ''}${real.stderr ?? ''}`,
    sub,
  };
});

bdd.thenStep('两次 change new 派生输出逐字节一致', (ctx) => {
  const r = ctx.fixtures['单根派生对照'] as {
    rootCode: number;
    rootOut: string;
    subCode: number;
    subOut: string;
  };
  if (r.rootCode !== 0 || r.subCode !== 0) {
    throw new Error(`dry-run must succeed in both cwds: root=${r.rootCode} sub=${r.subCode}`);
  }
  if (r.rootOut !== r.subOut) {
    throw new Error(
      `derived output differs by cwd:\nroot=${JSON.stringify(r.rootOut)}\nsub =${JSON.stringify(r.subOut)}`,
    );
  }
});

bdd.thenStep('在子目录真实落盘的 change 归位仓库根的 llmanspec', (ctx) => {
  const { root } = ctx.fixtures['工作区'] as { root: string };
  const r = ctx.fixtures['单根派生对照'] as {
    realCode: number;
    realOut: string;
    sub: string;
  };
  if (r.realCode !== 0) throw new Error(`change new failed in the subdir: ${r.realOut}`);
  if (!existsSync(join(root, 'llmanspec', 'changes', 'ns-real', 'proposal.md'))) {
    throw new Error('single-root resolution did not anchor the write at the root instance');
  }
  if (existsSync(join(r.sub, 'llmanspec'))) {
    throw new Error('a stray llmanspec/ was created under the subdirectory');
  }
});

bdd.given('一个根与子根各含归档 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  const seedArchive = (base: string, dir: string): void => {
    const full = join(base, 'llmanspec', 'changes', 'archive', dir);
    mkdirSync(full, { recursive: true });
    writeFileSync(
      join(full, 'proposal.md'),
      `---\ndepends_on: []\ntitle: ${dir}\n---\n\n## Why\nx\n\n## What Changes\n- y\n`,
    );
  };
  seedArchive(repo.root, '2026-01-01-root-archived');
  seedArchive(subRootOf(repo), '2026-02-02-sub-archived');
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('在子包源码子目录运行 archive freeze --dry-run', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const proc = runCli(['archive', 'freeze', '--dry-run'], subSrcDir(repo), process.env);
  ctx.fixtures['子根冻结结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('只列出子根实例的归档目录名', (ctx) => {
  const r = ctx.fixtures['子根冻结结果'] as { code: number; out: string };
  if (r.code !== 0) throw new Error(`sub-root freeze dry-run failed: ${r.out}`);
  if (!r.out.includes('2026-02-02-sub-archived')) {
    throw new Error(`sub-root archive entry missing from the freeze plan:\n${r.out}`);
  }
  if (r.out.includes('2026-01-01-root-archived')) {
    throw new Error(`launch root archive entry leaked into the sub-root plan:\n${r.out}`);
  }
});

bdd.when('在子包源码子目录运行 archive freeze 与 archive thaw --dest restored', (ctx) => {
  if (bundledSevenZip !== 'ok') {
    throw new Error(
      '[7z 环境守卫] bundled 7z-wasm 依赖不可用——多根 freeze/thaw 场景无法执行,请先 bun install',
    );
  }
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const cwd = subSrcDir(repo);
  const frozen = runCli(['archive', 'freeze', '--before', '2027-01-01'], cwd, process.env);
  const thawed = runCli(
    ['archive', 'thaw', '--change', '2026-02-02-sub-archived', '--dest', 'restored'],
    cwd,
    process.env,
  );
  ctx.fixtures['子根解冻结果'] = {
    cwd,
    frozenCode: frozen.status ?? 1,
    frozenOut: `${frozen.stdout ?? ''}${frozen.stderr ?? ''}`,
    thawedCode: thawed.status ?? 1,
    thawedOut: `${thawed.stdout ?? ''}${thawed.stderr ?? ''}`,
  };
});

bdd.thenStep('冷备与被解冻条目都只落在子根实例且根实例零新增', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['子根解冻结果'] as {
    cwd: string;
    frozenCode: number;
    frozenOut: string;
    thawedCode: number;
    thawedOut: string;
  };
  if (r.frozenCode !== 0) throw new Error(`sub-root freeze failed: ${r.frozenOut}`);
  if (r.thawedCode !== 0) throw new Error(`sub-root thaw failed: ${r.thawedOut}`);
  // freeze 的冷备落子根实例(根实例不产冷备)
  if (!existsSync(join(subRootOf(repo), 'llmanspec', 'changes', 'archive'))) {
    throw new Error('sub-root archive dir disappeared');
  }
  // r116 豁免:--dest 是用户显式路径参数,保持 cwd 字面量语义
  const restored = join(r.cwd, 'restored', '2026-02-02-sub-archived', 'proposal.md');
  if (!existsSync(restored)) {
    throw new Error(`thawed entry missing at the cwd-literal --dest path: ${restored}`);
  }
  // 根实例既未被冻结也未被解冻:归档目录原样、无 restored 目录
  if (
    !existsSync(
      join(repo.root, 'llmanspec', 'changes', 'archive', '2026-01-01-root-archived', 'proposal.md'),
    )
  ) {
    throw new Error('launch root archive entry was frozen by a sub-root invocation');
  }
  if (existsSync(join(repo.root, 'restored'))) {
    throw new Error('--dest leaked into the launch root instance');
  }
});

// ---------------------------------------------------------------------------
// r113 — 命名空间唯一性域按实例根(t6):跨根同名/同号各自成立、不阻断。
// ---------------------------------------------------------------------------

bdd.given('一个根与子根含同名 capability 与同号 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  // 跨根同名 capability + 同号 req:子根写一份与根同名的 `sample`(r113 合法)
  writeFileSync(
    join(subRootOf(repo), 'llmanspec', 'specs', 'sample.feature'),
    '# language: zh-CN\n# capability: sample\n# purpose: p\n# scope: tests/\n\n功能: sample\n\n  @req:r1\n  规则: 子根同名规则\n    系统 MUST x\n',
  );
  seedChange(repo, 'same', {
    proposal:
      '---\ndepends_on: []\ntitle: 根侧同名条目\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
  });
  seedSubChange(repo, 'same', '子根侧同名条目');
  ctx.fixtures['双根仓库'] = { repo };
});

bdd.when('在双根仓库运行 validate --specs --all-roots', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = repo.run('bun', [CLI, 'validate', '--specs', '--all-roots']);
  const machine = repo.run('bun', [CLI, 'validate', '--specs', '--all-roots', '--json']);
  ctx.fixtures['同名聚合结果'] = {
    code: r.code,
    out: `${r.stdout}${r.stderr}`,
    machineOut: machine.stdout,
  };
});

bdd.thenStep('两根的同号 id 各自成立且聚合校验退出码为 0', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['同名聚合结果'] as { code: number; out: string; machineOut: string };
  // 唯一性域按根:同名 capability 与同号 req/change 跨根并存 MUST NOT 构成冲突。
  if (r.code !== 0) throw new Error(`cross-root same-name ids must not fail: ${r.out}`);
  if (r.out.includes('single-ownership')) throw new Error(`ownership gate revived:\n${r.out}`);
  if (/duplicate/i.test(r.out)) throw new Error(`cross-root same-name ids flagged:\n${r.out}`);
  // 非空断言:两根确实都参与聚合(否则本场景会因只跑一根而恒绿)。
  if (!r.out.includes('packages/tui'))
    throw new Error(`sub-root missing from aggregate:\n${r.out}`);
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'same', 'proposal.md'))) {
    throw new Error('root change vanished');
  }
  if (!existsSync(join(subRootOf(repo), 'llmanspec', 'changes', 'same', 'proposal.md'))) {
    throw new Error('sub-root change vanished');
  }
  // r91/r115: 每根分组的条目 MUST 来自该根自己的注册表 —— 根侧只有 sample,
  // 子根侧同时有同名 sample 与本根独有的 tuicap。注意本场景从仓库根启动,
  // 修前修后结论相同(旧默认起点 process.cwd() 恰好等于仓库根,与逐根 io 叠加
  // 后读对),故它是未来回归护栏而非本次改动的判别证据;本条改动的判别力由
  // 「在子包子目录运行 validate --all-roots」的嵌套场景承担(对照实测:旧实现
  // 在嵌套 cwd 下伪造 spec/tuicap 与 req/r5 撞号)。
  const parsed = JSON.parse(r.machineOut) as {
    roots: Array<{ root: string; items: Array<{ id: string }> }>;
  };
  const ids = Object.fromEntries(
    parsed.roots.map((g) => [
      g.root,
      g.items
        .map((i) => i.id)
        .toSorted()
        .join(','),
    ]),
  );
  if (ids['.'] !== 'sample') {
    throw new Error(`根分组未读根注册表: ${JSON.stringify(ids)}`);
  }
  if (ids['packages/tui'] !== 'sample,tuicap') {
    throw new Error(`子根分组未读子根注册表: ${JSON.stringify(ids)}`);
  }
});

// ---------------------------------------------------------------------------
// r116 — 写入目标默认限当前实例根(t4):三类写面各一场景 + 两处显式豁免;
// 断言另一实例根的文件逐字节零改动。
// ---------------------------------------------------------------------------

/** 目录树的字节摘要(相对路径 + 内容),用于断言「另一根零改动」。 */
const treeDigest = (dir: string): string => {
  if (!existsSync(dir)) return '<absent>';
  const files: string[] = [];
  const walk = (rel: string): void => {
    const abs = rel === '' ? dir : join(dir, rel);
    for (const name of readdirSync(abs).toSorted()) {
      const childRel = rel === '' ? name : `${rel}/${name}`;
      const childAbs = join(dir, childRel);
      if (statSync(childAbs).isDirectory()) walk(childRel);
      else files.push(`${childRel}:${readFileSync(childAbs).toString('base64')}`);
    }
  };
  walk('');
  return files.toSorted().join('\n');
};

const recordWriteFace = (
  ctx: { fixtures: Record<string, unknown> },
  repo: TempRepo,
  run: () => { code: number; out: string },
): void => {
  const before = treeDigest(join(repo.root, 'llmanspec'));
  const subBefore = treeDigest(join(subRootOf(repo), 'llmanspec'));
  const r = run();
  ctx.fixtures['写面结果'] = {
    code: r.code,
    out: r.out,
    before,
    after: treeDigest(join(repo.root, 'llmanspec')),
    subBefore,
    subAfter: treeDigest(join(subRootOf(repo), 'llmanspec')),
  };
};

interface WriteFaceResult {
  code: number;
  out: string;
  before: string;
  after: string;
  subBefore: string;
  subAfter: string;
}

bdd.when('在仓库根运行 project dedupe-req-ids --directory 子根', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  recordWriteFace(ctx, repo, () => {
    const r = runCli(['project', 'dedupe-req-ids', '--directory', SUB], repo.root, process.env);
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  });
});

bdd.thenStep('子根注册表被重映射且根实例 llmanspec 树逐字节未变', (ctx) => {
  const r = ctx.fixtures['写面结果'] as WriteFaceResult;
  if (r.code !== 0) throw new Error(`scoped dedupe failed: ${r.out}`);
  if (!r.out.includes('remapping(s)')) throw new Error(`no remap reported:\n${r.out}`);
  // 正向证据:命中实例根确实被改写(否则本场景会因未写入而恒绿)
  if (r.subBefore === r.subAfter) throw new Error('sub-root registry was not rewritten');
  if (r.before !== r.after) {
    throw new Error('launch root instance was modified by a sub-root write (r116 violation)');
  }
});

bdd.given('一个根实例含既有 change 且子根已 start 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  seedChange(repo, 'root-keep', { commit: 'seed root change' });
  const id = 'ns-fin';
  // 子根 change 显式声明不改合约:specs-landed 判据是根字面量前缀
  // (`llmanspec/specs/`),per-root 的 specs 编辑不计入 —— 收口门此处以
  // needs_specs_change:false 通过,该判据的 per-root 口径另行报告。
  seedSubChangeProposal(repo, id, '子根待收口条目');
  repo.run('git', ['add', '-A']);
  repo.run('git', [
    '-c',
    'user.email=t@t',
    '-c',
    'user.name=t',
    'commit',
    '-qm',
    'seed sub-root change',
  ]);
  const src = subSrcDir(repo);
  const started = runCli(['change', 'start', id], src, process.env);
  if (started.status !== 0) {
    throw new Error(`sub-root change start failed: ${started.stdout ?? ''}${started.stderr ?? ''}`);
  }
  ctx.fixtures['双根仓库'] = { repo, id, src };
});

bdd.when('在子包源码子目录运行 change new 与 change finalize', (ctx) => {
  const { repo, id, src } = ctx.fixtures['双根仓库'] as {
    repo: TempRepo;
    id: string;
    src: string;
  };
  recordWriteFace(ctx, repo, () => {
    const created = runCli(['change', 'new', 'ns-extra'], src, process.env);
    if ((created.status ?? 1) !== 0) {
      return {
        code: created.status ?? 1,
        out: `${created.stdout ?? ''}${created.stderr ?? ''}`,
      };
    }
    repo.run('git', ['add', '-A']);
    repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft: extra']);
    const finalized = runCli(['change', 'finalize', id], src, process.env);
    return {
      code: finalized.status ?? 1,
      out: `${finalized.stdout ?? ''}${finalized.stderr ?? ''}`,
    };
  });
});

bdd.thenStep('子根产物归位子根且根实例 llmanspec 树逐字节未变', (ctx) => {
  const { repo, id } = ctx.fixtures['双根仓库'] as { repo: TempRepo; id: string };
  const r = ctx.fixtures['写面结果'] as WriteFaceResult;
  if (r.code !== 0) throw new Error(`sub-root finalize failed: ${r.out}`);
  const subChanges = join(subRootOf(repo), 'llmanspec', 'changes');
  // change new 的草稿与 finalize 的 SSOT 改名产物都落在子根实例
  if (!existsSync(join(subChanges, 'ns-extra', 'proposal.md'))) {
    throw new Error('sub-root change new did not land in the sub-root instance');
  }
  const archived = readdirSync(join(subChanges, 'archive'));
  if (!archived.some((name) => name.endsWith(`-${id}`))) {
    throw new Error(`finalize rename missing from the sub-root archive: ${archived.join(',')}`);
  }
  if (existsSync(join(repo.root, 'llmanspec', 'changes', 'ns-extra'))) {
    throw new Error('sub-root change new leaked into the launch root instance');
  }
  if (r.before !== r.after) {
    throw new Error('launch root instance was modified by a sub-root write (r116 violation)');
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'root-keep', 'proposal.md'))) {
    throw new Error('launch root change vanished');
  }
});

bdd.when('在子包源码子目录运行 archive freeze', (ctx) => {
  if (bundledSevenZip !== 'ok') {
    throw new Error('[7z 环境守卫] bundled 7z-wasm 依赖不可用——archive freeze 场景无法执行');
  }
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const cwd = subSrcDir(repo);
  recordWriteFace(ctx, repo, () => {
    const r = runCli(['archive', 'freeze', '--before', '2027-01-01'], cwd, process.env);
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  });
});

bdd.thenStep('子根归档被冻结且根实例 llmanspec 树逐字节未变', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['写面结果'] as WriteFaceResult;
  if (r.code !== 0) throw new Error(`sub-root freeze failed: ${r.out}`);
  if (r.subBefore === r.subAfter) throw new Error('sub-root archive was not frozen');
  if (r.before !== r.after) {
    throw new Error('launch root instance was modified by a sub-root freeze (r116 violation)');
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'archive', '2026-01-01-root-archived'))) {
    throw new Error('launch root archive entry was consumed');
  }
});

// --- 两处显式豁免 ----------------------------------------------------------

bdd.thenStep('根实例托管块被跨根刷新属显式豁免', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['子根update结果'] as { code: number; out: string };
  if (r.code !== 0) throw new Error(`sub-root init --update failed: ${r.out}`);
  const rootAgents = readFileSync(join(repo.root, 'AGENTS.md'), 'utf8');
  if (rootAgents.includes('TAMPER-MARK')) {
    throw new Error('exempted cross-root managed-block refresh did not happen');
  }
  if (!rootAgents.includes('LLMANSPEC:START')) {
    throw new Error('root managed block missing after the exempted refresh');
  }
});

bdd.given('根实例 specs 含 legacy 标签式 spec 文件', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'legacy.feature'),
    '# language: zh-CN\n# capability: legacy\n# purpose: p\n# scope: llmanspec/\n\n功能: legacy\n\n  @req:r21 @human\n  场景: 旧式场景\n    - 系统 MUST 输出稳定结果。\n    假如 输入为 `1`\n    当 系统执行\n    那么 输出 MUST 为 `1`\n',
  );
});

bdd.when('在子包源码子目录运行 spec migrate-native 指向根实例文件', (ctx) => {
  const { repo, src } = ctx.fixtures['双根仓库'] as { repo: TempRepo; src?: string };
  const cwd = src ?? subSrcDir(repo);
  const target = relative(cwd, join(repo.root, 'llmanspec', 'specs', 'legacy.feature'));
  const before = treeDigest(join(repo.root, 'llmanspec'));
  const subBefore = treeDigest(join(subRootOf(repo), 'llmanspec'));
  const r = runCli(['spec', 'migrate-native', target, '--yes'], cwd, process.env);
  ctx.fixtures['迁移写结果'] = {
    code: r.status ?? 1,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    target,
    before,
    after: treeDigest(join(repo.root, 'llmanspec')),
    subBefore,
    subAfter: treeDigest(join(subRootOf(repo), 'llmanspec')),
  };
});

bdd.thenStep('该根实例文件按显式路径被迁移且子根实例零写入', (ctx) => {
  const { repo } = ctx.fixtures['双根仓库'] as { repo: TempRepo };
  const r = ctx.fixtures['迁移写结果'] as {
    code: number;
    out: string;
    target: string;
    before: string;
    after: string;
    subBefore: string;
    subAfter: string;
  };
  if (r.code !== 0) throw new Error(`migrate-native failed: ${r.out}`);
  const migrated = readFileSync(join(repo.root, 'llmanspec', 'specs', 'legacy.feature'), 'utf8');
  if (!migrated.includes('规则:')) throw new Error(`explicit path was not migrated:\n${migrated}`);
  // 显式路径豁免:目标在根实例,写入确实发生(非默认目标约束)
  if (r.before === r.after) throw new Error('explicit --paths target was not written');
  if (existsSync(join(subRootOf(repo), 'llmanspec', 'specs', 'legacy.feature'))) {
    throw new Error('explicit path was re-anchored to the instance root instead of cwd');
  }
  // 豁免同样受 r116 的越根约束:显式路径只授权写目标文件,子根 llmanspec 树
  // MUST 逐字节未变(单文件存在性检查不足以覆盖同根其他产物的写入)。
  if (r.subBefore !== r.subAfter) {
    throw new Error('explicit-path write leaked into the sub-root instance');
  }
});

// ---------------------------------------------------------------------------
// r115 — `--directory` 固定发现起点同样约束 validate 与 show(修订 C1/C2):
// 入口拼接后,`--directory` 在 validate 上曾被忽略、show 文本面漏传,导致
// 「限定实例根」读到启动目录的注册表,且 show 两个输出面对同一 change 判不同
// gate。以下步骤钉住该不变量。
// ---------------------------------------------------------------------------

const itemIdsOf = (out: string): string[] =>
  (JSON.parse(out) as { items: Array<{ id: string }> }).items.map((i) => i.id).toSorted();

bdd.given('一个根与子根含不同 capability 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  ctx.fixtures['异质双根仓库'] = { repo };
});

bdd.when('在仓库根与仓库外分别以 --directory 运行 validate --specs --json', (ctx) => {
  const { repo } = ctx.fixtures['异质双根仓库'] as { repo: TempRepo };
  // 仓库外的空目录:绝对 --directory 也必须只靠根发现算子找到实例(r109)
  const outside = mkdtempSync(join(tmpdir(), 'llman-sdd-outside-'));
  const scoped = runCli(
    ['validate', '--specs', '--json', '--directory', SUB],
    repo.root,
    process.env,
  );
  const fromOutside = runCli(
    ['validate', '--specs', '--json', '--directory', repo.root],
    outside,
    process.env,
  );
  ctx.fixtures['限定注册表结果'] = {
    scopedCode: scoped.status ?? 1,
    scopedOut: scoped.stdout ?? '',
    scopedErr: scoped.stderr ?? '',
    outsideCode: fromOutside.status ?? 1,
    outsideOut: fromOutside.stdout ?? '',
    outsideErr: fromOutside.stderr ?? '',
  };
});

bdd.thenStep('两次条目都属于被限定的实例根且退出码为 0', (ctx) => {
  const r = ctx.fixtures['限定注册表结果'] as {
    scopedCode: number;
    scopedOut: string;
    scopedErr: string;
    outsideCode: number;
    outsideOut: string;
    outsideErr: string;
  };
  if (r.scopedCode !== 0) throw new Error(`--directory 子根校验失败: ${r.scopedErr}`);
  const scopedIds = itemIdsOf(r.scopedOut).join(',');
  if (scopedIds !== 'tuicap') {
    throw new Error(`限定子根却判了启动根的注册表: ${scopedIds}`);
  }
  if (r.outsideCode !== 0) throw new Error(`仓库外限定根校验失败: ${r.outsideErr}`);
  const outsideIds = itemIdsOf(r.outsideOut).join(',');
  if (outsideIds !== 'sample') {
    throw new Error(`仓库外限定根读到错误注册表: ${outsideIds}`);
  }
});

bdd.given('一个子根实例 specs 失效而根实例 specs 有效且子根含 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  // 子根实例同 capability 内 r5 撞号 → 子根注册表判红;根侧 sample 保持有效。
  // 判别方向必须这样选:注册表被读空、被读成根侧注册表,都与「正确读到子根
  // 注册表」给出相反的 gate 结论(旧缺陷两面都读启动根 → 假通过)。
  writeFileSync(
    join(subRootOf(repo), 'llmanspec', 'specs', 'tuicap.feature'),
    '# language: zh-CN\n# capability: tuicap\n# purpose: p\n# scope: tests/\n\n功能: tuicap\n\n  @req:r5\n  规则: 子规则\n    系统 MUST y\n\n  @req:r5\n  规则: 另一子规则\n    系统 MUST z\n',
  );
  seedSubChange(repo, 'tuichange', '子根待观测条目');
  ctx.fixtures['失效根仓库'] = { repo };
});

bdd.when('在仓库根分别以 human 与 json 形态运行 show 子根条目 --directory 子根', (ctx) => {
  const { repo } = ctx.fixtures['失效根仓库'] as { repo: TempRepo };
  const human = runCli(
    ['show', 'tuichange', '--directory', SUB, '--output', 'human'],
    repo.root,
    process.env,
  );
  const machine = runCli(
    ['show', 'tuichange', '--directory', SUB, '--output', 'json'],
    repo.root,
    process.env,
  );
  ctx.fixtures['双面 gate 结果'] = {
    humanCode: human.status ?? 1,
    humanOut: `${human.stdout ?? ''}${human.stderr ?? ''}`,
    machineCode: machine.status ?? 1,
    machineOut: machine.stdout ?? '',
  };
});

bdd.thenStep('两形态的 gate 结论逐项一致且 validate 门按子根注册表判红', (ctx) => {
  const r = ctx.fixtures['双面 gate 结果'] as {
    humanCode: number;
    humanOut: string;
    machineCode: number;
    machineOut: string;
  };
  if (r.machineCode !== 0) throw new Error(`json 形态失败: ${r.machineOut}`);
  const parsed = JSON.parse(r.machineOut) as {
    gateChecks: Array<{ name: string; pass: boolean }>;
  };
  const validate = parsed.gateChecks.find((g) => g.name === 'validate');
  // 相对 --directory 下子根注册表失效 ⇒ 机器面 validate 门必须判红:若规格
  // 目录被解析成不存在的路径(启动锚 + 相对串被根锚 io 二次拼接),注册表读空
  // 会让该门静默通过 —— 这是本条断言的判别点。
  if (validate?.pass !== false) {
    throw new Error(
      `机器面 validate 门未按子根注册表判红(注册表被读空?): ${JSON.stringify(validate)}`,
    );
  }
  const gates = /Gates: (\d+)\/(\d+) pass/u.exec(r.humanOut);
  if (gates === null) throw new Error(`human 形态缺 Gates 段:\n${r.humanOut}`);
  const machinePass = parsed.gateChecks.filter((g) => g.pass).length;
  if (Number(gates[2]) !== parsed.gateChecks.length || Number(gates[1]) !== machinePass) {
    throw new Error(
      `human 与 json 的 gate 结论不一致: human ${gates[1]}/${gates[2]} vs json ${machinePass}/${parsed.gateChecks.length}\n${r.humanOut}`,
    );
  }
  if (!r.humanOut.includes('✗ validate')) {
    throw new Error(`human 形态漏报了子根注册表的失效 gate:\n${r.humanOut}`);
  }
});

// ---------------------------------------------------------------------------
// r91 — 聚合校验逐根读各自注册表(嵌套 cwd 下曾整轮落到单一注册表并伪造撞号)。
// ---------------------------------------------------------------------------

bdd.when('在子包子目录运行 validate --all-roots --json', (ctx) => {
  const { repo } = ctx.fixtures['异质双根仓库'] as { repo: TempRepo };
  const r = runCli(
    ['validate', '--all-roots', '--json'],
    join(subRootOf(repo), 'tests'),
    process.env,
  );
  ctx.fixtures['嵌套聚合结果'] = { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' };
});

bdd.thenStep('各根分组条目为各自实例根的注册表且无跨根撞号观测', (ctx) => {
  const r = ctx.fixtures['嵌套聚合结果'] as { code: number; out: string; err: string };
  if (r.code !== 0) throw new Error(`聚合校验失败: ${r.err}`);
  const parsed = JSON.parse(r.out) as {
    roots: Array<{ root: string; items: Array<{ id: string }> }>;
    crossRootCollisions?: Array<{ namespace: string; value: string }>;
  };
  const ids = Object.fromEntries(
    parsed.roots.map((g) => [
      g.root,
      g.items
        .map((i) => i.id)
        .toSorted()
        .join(','),
    ]),
  );
  if (ids['.'] !== 'sample') throw new Error(`根分组未读根注册表: ${JSON.stringify(ids)}`);
  if (ids['packages/tui'] !== 'tuicap') {
    throw new Error(`子根分组未读子根注册表: ${JSON.stringify(ids)}`);
  }
  // 异质双根无同号 id:观测段零条目(双根本该各读各的注册表;曾因整轮落到
  // 单一注册表而伪造出 spec/sample 或 spec/tuicap 撞号)。
  const collisions = parsed.crossRootCollisions ?? [];
  if (collisions.length !== 0) {
    throw new Error(`异质双根不得报告撞号: ${JSON.stringify(collisions)}`);
  }
});

// ---------------------------------------------------------------------------
// r115/r91/r109 — 相对 --directory:起点 MUST 在 CLI 边界绝对化。相对串曾与
// makeIo(rootDir) 双重拼接(<dir>/<dir>/llmanspec)使聚合报假域错误;单段相对名
// (`packages`)也曾因核心向上截断得到空父串而无法升到祖先实例根。
// ---------------------------------------------------------------------------

bdd.when('以相对与绝对 --directory 各运行一次 validate --all-roots --json 与 list', (ctx) => {
  const { repo } = ctx.fixtures['异质双根仓库'] as { repo: TempRepo };
  const picked = (args: string[]) => {
    const r = runCli(args, repo.root, process.env);
    return { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' };
  };
  ctx.fixtures['相对绝对对照'] = {
    relAgg: picked(['validate', '--all-roots', '--json', '--directory', SUB]),
    absAgg: picked(['validate', '--all-roots', '--json', '--directory', subRootOf(repo)]),
    relList: picked(['list', '--json', '--directory', 'packages']),
    absList: picked(['list', '--json', '--directory', join(repo.root, 'packages')]),
  };
});

bdd.thenStep('两种写法读到同一注册表且相对写法可升到祖先实例根', (ctx) => {
  const r = ctx.fixtures['相对绝对对照'] as Record<
    'relAgg' | 'absAgg' | 'relList' | 'absList',
    { code: number; out: string; err: string }
  >;
  if (r.relAgg.code !== 0) {
    throw new Error(`相对 --directory 聚合失败: ${r.relAgg.err || r.relAgg.out}`);
  }
  if (r.absAgg.code !== 0) {
    throw new Error(`绝对 --directory 聚合失败: ${r.absAgg.err || r.absAgg.out}`);
  }
  if (JSON.stringify(JSON.parse(r.relAgg.out)) !== JSON.stringify(JSON.parse(r.absAgg.out))) {
    throw new Error(`相对与绝对 --directory 的聚合结论不同:\n${r.relAgg.out}\n${r.absAgg.out}`);
  }
  if (r.relList.code !== 0) {
    throw new Error(`相对 --directory 读取失败: ${r.relList.err || r.relList.out}`);
  }
  if (r.relList.out !== r.absList.out) {
    throw new Error(`相对与绝对 --directory 的 list 输出不同:\n${r.relList.out}\n${r.absList.out}`);
  }
});

// ---------------------------------------------------------------------------
// r118 — 链接 worktree 缺实例目录时编号清点跳过该树(原实现裸 lstatSync,
// 直接抛 `ENOENT: ... lstat '<worktree>/llmanspec'`,违反 r109 不泄漏底层错误)。
// ---------------------------------------------------------------------------

bdd.given('一个含链接 worktree 且该 worktree 无 llmanspec 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedChange(repo, 'keep', { commit: 'seed change' });
  const side = join(repo.root, '..', `${basename(repo.root)}-side`);
  const added = repo.run('git', ['worktree', 'add', '-b', 'side/no-instance', side]);
  if (added.code !== 0) throw new Error(`worktree add failed: ${added.stderr}`);
  // 该 worktree 缺实例目录:清点 MUST 视其为「不存在」而非报错
  rmSync(join(side, 'llmanspec'), { recursive: true, force: true });
  ctx.fixtures['缺实例 worktree 仓库'] = { repo, side };
});

bdd.when('在主检出运行 change next-id', (ctx) => {
  const { repo } = ctx.fixtures['缺实例 worktree 仓库'] as { repo: TempRepo };
  const r = runCli(['change', 'next-id'], repo.root, process.env);
  ctx.fixtures['worktree 编号结果'] = {
    code: r.status ?? 1,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
  };
});

bdd.thenStep('退出码为 0 且输出不含 ENOENT', (ctx) => {
  const r = ctx.fixtures['worktree 编号结果'] as { code: number; out: string };
  if (r.code !== 0) throw new Error(`缺实例 worktree 使编号清点失败: ${r.out}`);
  if (r.out.includes('ENOENT') || r.out.includes('no such file')) {
    throw new Error(`编号清点泄漏底层 IO 错误: ${r.out}`);
  }
});

// ---------------------------------------------------------------------------
// r119 — specs-landed 判据按 change 所属实例根:子根 change 落地子根 specs 即过
// 收口门;只动根实例 specs 不过门(严格本实例)。
// ---------------------------------------------------------------------------

const seedSubRootChangeDocs = (repo: TempRepo, id: string): void => {
  const dir = join(subRootOf(repo), 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'proposal.md'),
    `---\ndepends_on: []\ntitle: 子根规格落地条目\n---\n\n## Why\nx\n\n## What Changes\n- y\n`,
  );
  writeFileSync(join(dir, 'design.md'), '# d\n');
  writeFileSync(join(dir, 'tasks.md'), '- [x] 落地\n');
};

const LAND_RULE = '\n  @req:r6\n  规则: 落地规则\n    系统 MUST z\n';

bdd.given('一个根与子根双实例且子根 change 已绑定分支并提交子根 specs 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  seedSubRootChangeDocs(repo, 'subland');
  const committed = repo.run('git', ['add', '-A']);
  if (committed.code !== 0) throw new Error(committed.stderr);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed']);
  const started = runCli(['change', 'start', 'subland'], subRootOf(repo), process.env);
  if (started.status !== 0) {
    throw new Error(`change start failed: ${started.stdout ?? ''}${started.stderr ?? ''}`);
  }
  // 落地子根 specs:追加合法规则块(tuicap 现有 r5 → 新块 r6)
  writeFileSync(
    join(subRootOf(repo), 'llmanspec', 'specs', 'tuicap.feature'),
    readFileSync(join(subRootOf(repo), 'llmanspec', 'specs', 'tuicap.feature'), 'utf8') + LAND_RULE,
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'land specs']);
  ctx.fixtures['子根落地仓库'] = { repo };
});

bdd.when('在子根实例上运行 show 该 change 与 change finalize 该 change', (ctx) => {
  const { repo } = ctx.fixtures['子根落地仓库'] as { repo: TempRepo };
  const showed = runCli(['show', 'subland', '--output', 'json'], subRootOf(repo), process.env);
  const finalized = runCli(['change', 'finalize', 'subland'], subRootOf(repo), process.env);
  ctx.fixtures['子根收口结果'] = {
    showOut: showed.stdout ?? '',
    showCode: showed.status ?? 1,
    finOut: `${finalized.stdout ?? ''}${finalized.stderr ?? ''}`,
    finCode: finalized.status ?? 1,
  };
});

bdd.thenStep('show 的 specs-landed 门为通过且 finalize 收口不再被 specs 落地门拦截', (ctx) => {
  const r = ctx.fixtures['子根收口结果'] as {
    showOut: string;
    showCode: number;
    finOut: string;
    finCode: number;
  };
  if (r.showCode !== 0) throw new Error(`show 失败: ${r.showOut}`);
  const parsed = JSON.parse(r.showOut) as { gateChecks: Array<{ name: string; pass: boolean }> };
  const gate = parsed.gateChecks.find((g) => g.name === 'specs-landed');
  if (gate?.pass !== true) {
    throw new Error(`子根 specs 落地未过门(仍按根字面量判定?): ${JSON.stringify(gate)}`);
  }
  if (r.finCode !== 0) throw new Error(`finalize 失败: ${r.finOut}`);
  if (r.finOut.includes('close-out blocked')) {
    throw new Error(`finalize 被 specs 落地门拦截:\n${r.finOut}`);
  }
});

bdd.given('一个根与子根双实例且子根 change 已绑定分支但只提交了根实例 specs 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  seedSubRoot(repo);
  seedSubRootChangeDocs(repo, 'subland');
  const committed = repo.run('git', ['add', '-A']);
  if (committed.code !== 0) throw new Error(committed.stderr);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed']);
  const started = runCli(['change', 'start', 'subland'], subRootOf(repo), process.env);
  if (started.status !== 0) {
    throw new Error(`change start failed: ${started.stdout ?? ''}${started.stderr ?? ''}`);
  }
  // 只动根实例 specs(sample 现有 r1 → 新块 r2):不满足子根前缀,门必须仍红
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'sample.feature'),
    readFileSync(join(repo.root, 'llmanspec', 'specs', 'sample.feature'), 'utf8') +
      '\n  @req:r2\n  规则: 另一规则\n    系统 MUST w\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'root specs']);
  ctx.fixtures['子根未落地仓库'] = { repo };
});

bdd.when('在子根实例上运行 show 该 change', (ctx) => {
  const { repo } = ctx.fixtures['子根未落地仓库'] as { repo: TempRepo };
  const showed = runCli(['show', 'subland', '--output', 'json'], subRootOf(repo), process.env);
  ctx.fixtures['子根未落地结果'] = {
    showOut: showed.stdout ?? '',
    showCode: showed.status ?? 1,
  };
});

bdd.thenStep('show 的 specs-landed 门为不通过且提示落在本实例 llmanspec/specs', (ctx) => {
  const r = ctx.fixtures['子根未落地结果'] as { showOut: string; showCode: number };
  if (r.showCode !== 0) throw new Error(`show 失败: ${r.showOut}`);
  const parsed = JSON.parse(r.showOut) as {
    gateChecks: Array<{ name: string; pass: boolean; hint: string }>;
  };
  const gate = parsed.gateChecks.find((g) => g.name === 'specs-landed');
  if (gate?.pass !== false) {
    throw new Error(`只动根实例 specs 却过了子根落地门(前缀未生效?): ${JSON.stringify(gate)}`);
  }
  if (!gate.hint.includes('packages/tui/llmanspec/specs/')) {
    throw new Error(`提示未指向本实例 specs 目录: ${gate.hint}`);
  }
});

// ---------------------------------------------------------------------------
// cli r109 — 缺实例链接 worktree 中 archive freeze 报域错误且可显式重定向。
// ---------------------------------------------------------------------------

bdd.given('一个根实例含归档条目且挂有缺 llmanspec 链接 worktree 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const archDir = join(repo.root, 'llmanspec', 'changes', 'archive', '2026-01-01-old');
  mkdirSync(archDir, { recursive: true });
  writeFileSync(
    join(archDir, 'proposal.md'),
    '---\ndepends_on: []\ntitle: 旧条目\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
  );
  const committed = repo.run('git', ['add', '-A']);
  if (committed.code !== 0) throw new Error(committed.stderr);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'archived']);
  const side = join(repo.root, '..', `${basename(repo.root)}-side`);
  const added = repo.run('git', ['worktree', 'add', '-b', 'side/no-inst', side]);
  if (added.code !== 0) throw new Error(`worktree add failed: ${added.stderr}`);
  rmSync(join(side, 'llmanspec'), { recursive: true, force: true });
  ctx.fixtures['缺实例 worktree 归档仓库'] = { repo, side };
});

bdd.when(
  '在该 worktree 内运行 archive freeze --dry-run 并再以 --directory 指向主检出运行一次',
  (ctx) => {
    const { repo, side } = ctx.fixtures['缺实例 worktree 归档仓库'] as {
      repo: TempRepo;
      side: string;
    };
    const plain = runCli(['archive', 'freeze', '--dry-run'], side, process.env);
    const redirected = runCli(
      ['archive', 'freeze', '--dry-run', '--directory', repo.root],
      side,
      process.env,
    );
    ctx.fixtures['缺实例 freeze 结果'] = {
      plainCode: plain.status ?? 1,
      plainOut: `${plain.stdout ?? ''}${plain.stderr ?? ''}`,
      redirCode: redirected.status ?? 1,
      redirOut: `${redirected.stdout ?? ''}${redirected.stderr ?? ''}`,
    };
  },
);

bdd.thenStep('缺省调用报域错误退出 1,显式重定向可用且输出非主检出 WARNING', (ctx) => {
  const r = ctx.fixtures['缺实例 freeze 结果'] as {
    plainCode: number;
    plainOut: string;
    redirCode: number;
    redirOut: string;
  };
  if (r.plainCode !== 1) throw new Error(`缺省调用未按域错误退出(${r.plainCode}): ${r.plainOut}`);
  if (!r.plainOut.includes('no llmanspec root at or above')) {
    throw new Error(`缺省调用未报域错误: ${r.plainOut}`);
  }
  if (r.plainOut.includes('ENOENT')) throw new Error(`缺省调用泄漏底层错误: ${r.plainOut}`);
  if (r.redirCode !== 0) throw new Error(`显式重定向失败: ${r.redirOut}`);
  if (!r.redirOut.includes('non-main checkout')) {
    throw new Error(`重定向输出缺非主检出 WARNING: ${r.redirOut}`);
  }
  if (!r.redirOut.includes('2026-01-01-old')) {
    throw new Error(`重定向未列出归档条目: ${r.redirOut}`);
  }
});

// ---------------------------------------------------------------------------
// r118/W1 — 子根 change 分支由链接 worktree 持有时,finalize 的归档改名必须
// 重定向到主检出的同一子根实例(ioAt 重定向携带实例偏移;旧实现以持有者
// toplevel 直接拼接根相对路径,子根 rename 落到主检出根实例而 ENOENT)。
// ---------------------------------------------------------------------------

bdd.given(
  '一个根与子根双实例且子根 change 分支由链接 worktree 持有并已在该 worktree 落地子根 specs 的临时仓库',
  (ctx) => {
    const repo = makeTempRepo();
    seedSubRoot(repo);
    seedSubRootChangeDocs(repo, 'subland');
    const committed = repo.run('git', ['add', '-A']);
    if (committed.code !== 0) throw new Error(committed.stderr);
    repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed']);
    const wt = join(repo.root, '..', `${basename(repo.root)}-wt`);
    const added = repo.run('git', ['worktree', 'add', '-b', 'sdd/subland', wt]);
    if (added.code !== 0) throw new Error(`worktree add failed: ${added.stderr}`);
    // 绑定写在分支上(该 worktree 持有分支);base_sha 仅审计,取分叉点
    const sha = repo.run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim();
    writeFileSync(
      join(wt, SUB, 'llmanspec', 'changes', 'subland', 'proposal.md'),
      `---\ndepends_on: []\ntitle: 子根规格落地条目\nbranch: sdd/subland\nbase_branch: main\nbase_sha: ${sha}\n---\n\n## Why\nx\n\n## What Changes\n- y\n`,
    );
    const bound = repo.run('git', [
      '-C',
      wt,
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      'commit',
      '-aqm',
      'bind',
    ]);
    if (bound.code !== 0) throw new Error(bound.stderr);
    // 在该 worktree 落地子根 specs(分支的 specs diff 即来自这里)
    writeFileSync(
      join(wt, SUB, 'llmanspec', 'specs', 'tuicap.feature'),
      readFileSync(join(wt, SUB, 'llmanspec', 'specs', 'tuicap.feature'), 'utf8') + LAND_RULE,
    );
    const landed = repo.run('git', [
      '-C',
      wt,
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      'commit',
      '-aqm',
      'land specs',
    ]);
    if (landed.code !== 0) throw new Error(landed.stderr);
    ctx.fixtures['worktree 子根收口仓库'] = { repo, wt };
  },
);

bdd.when('在该 worktree 的子包目录运行 change finalize 该 change', (ctx) => {
  const { repo, wt } = ctx.fixtures['worktree 子根收口仓库'] as {
    repo: TempRepo;
    wt: string;
  };
  const fin = runCli(['change', 'finalize', 'subland'], join(wt, SUB), process.env);
  ctx.fixtures['worktree 子根收口结果'] = {
    code: fin.status ?? 1,
    out: `${fin.stdout ?? ''}${fin.stderr ?? ''}`,
    repo,
    wt,
  };
});

bdd.thenStep('退出码为 0 且归档目录落在主检出的子根实例而不再报 ENOENT', (ctx) => {
  const r = ctx.fixtures['worktree 子根收口结果'] as {
    code: number;
    out: string;
    repo: TempRepo;
    wt: string;
  };
  if (r.code !== 0) throw new Error(`finalize 失败:\n${r.out}`);
  if (r.out.includes('ENOENT')) throw new Error(`归档改名泄漏 ENOENT:\n${r.out}`);
  const archiveRoot = join(r.repo.root, SUB, 'llmanspec', 'changes', 'archive');
  const names = readdirSync(archiveRoot);
  if (!names.some((n) => n.endsWith('-subland'))) {
    throw new Error(`主检出子根实例缺归档目录: ${names.join(',')}`);
  }
  if (existsSync(join(r.repo.root, SUB, 'llmanspec', 'changes', 'subland'))) {
    throw new Error('主检出子根实例的原 change 目录未被改名');
  }
});
