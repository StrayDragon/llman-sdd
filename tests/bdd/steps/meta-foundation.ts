// Meta-foundation step definitions (BDD executable 化 LOWER 批):
//   - init-generators r17/r18 — render semantics + locale fallback chain,
//     driving @llman-sdd/core pure functions directly (assertions rewritten
//     from tests/unit/templates.test.ts).
//   - review-freeze r24 — freeze cold-backup contract through the real CLI in
//     a temp workspace (7z capability comes from the bundled 7z-wasm
//     dependency; see the guard note below).
// This module is imported by run.test.ts AFTER smoke/domain/context so
// first-match dispatch keeps pre-existing step texts authoritative.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FREEZE_ARCHIVE_NAME,
  MAX_UNIT_NESTING_DEPTH,
  loadLocaleResource,
  loadUnitRegistry,
  localeFallbacks,
  normalizeLocale,
  renderTemplate,
  renderWithUnits,
  runInit,
} from '@llman-sdd/core';

import { makeNodeIo } from '../../helpers/nodeIo.ts';
import { bdd } from '../runner.ts';
import { runCli } from './shared.ts';

/** Capture an expected throw into a tagged result record. */
function captureThrow(run: () => unknown): { threw: boolean; message: string } {
  try {
    run();
    return { threw: false, message: '' };
  } catch (error) {
    return { threw: true, message: (error as Error).message };
  }
}

// ---------------------------------------------------------------------------
// r17 — template render semantics (direct core calls + one real write)
// ---------------------------------------------------------------------------

interface RenderSample {
  lenient: string;
  injected: string;
  unitExpanded: string;
  missingUnit: { threw: boolean; message: string };
  depthCap: { threw: boolean; message: string };
  trimmed: string;
  withUnitsTrimmed: string;
  written: string;
}

bdd.given('v2 模板引擎与样例单元表', (ctx) => {
  // 同环境同变量:unit(id) 递归展开复用同一 vars 环境
  const units = new Map([
    ['a', 'A{{ unit("b") }}'],
    ['b', 'B'],
  ]);
  ctx.fixtures['渲染样例'] = { units };
  return ctx.fixtures['渲染样例'];
});

bdd.when('v2 渲染样例模板并经 init 落盘临时工作区', (ctx) => {
  const { units } = ctx.fixtures['渲染样例'] as { units: Map<string, string> };
  const sample: RenderSample = {
    lenient: renderTemplate('a={{ nope }}', units, {}),
    injected: renderTemplate('v={{ llman_version }}', units, { llman_version: '9.9.9' }),
    unitExpanded: renderTemplate('{{ unit("a") }}', units, {}),
    missingUnit: captureThrow(() => renderTemplate('{{ unit("nope") }}', units, {})),
    depthCap: captureThrow(() =>
      renderTemplate('{{ unit("x") }}', new Map([['x', 'X{{ unit("x") }}']]), {}),
    ),
    trimmed: renderTemplate('x  \n\n', units, {}),
    withUnitsTrimmed: renderWithUnits('x\n', units, {}),
    written: '',
  };
  // 落盘单换行是 init 写盘层的合同:经真实 runInit 落盘后读回
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-r17-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: zh-Hans\n');
  runInit(
    makeNodeIo(root),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0' },
  );
  sample.written = readFileSync(
    join(root, '.agents', 'skills', 'llman-sdd-explore', 'SKILL.md'),
    'utf8',
  );
  ctx.fixtures['渲染样例'] = { sample };
});

bdd.thenStep('未定义变量渲染为空且字符串变量注入一致', (ctx) => {
  const { sample } = ctx.fixtures['渲染样例'] as { sample: RenderSample };
  if (sample.lenient !== 'a=')
    throw new Error(`lenient render broken: ${JSON.stringify(sample.lenient)}`);
  if (sample.injected !== 'v=9.9.9') {
    throw new Error(`string injection broken: ${JSON.stringify(sample.injected)}`);
  }
});

bdd.thenStep('unit 递归展开且缺失 id 与嵌套超限均报错', (ctx) => {
  const { sample } = ctx.fixtures['渲染样例'] as { sample: RenderSample };
  if (sample.unitExpanded !== 'AB') {
    throw new Error(`unit recursion broken: ${JSON.stringify(sample.unitExpanded)}`);
  }
  if (!sample.missingUnit.threw || !/missing template unit/u.test(sample.missingUnit.message)) {
    throw new Error(`missing unit id did not error: ${JSON.stringify(sample.missingUnit)}`);
  }
  if (!sample.depthCap.threw || !/nesting exceeded/u.test(sample.depthCap.message)) {
    throw new Error(`depth cap did not error: ${JSON.stringify(sample.depthCap)}`);
  }
  if (MAX_UNIT_NESTING_DEPTH !== 32) {
    throw new Error(`depth cap drifted: ${String(MAX_UNIT_NESTING_DEPTH)}`);
  }
});

bdd.thenStep('渲染产物无尾随空白且落盘产物以单一换行结尾', (ctx) => {
  const { sample } = ctx.fixtures['渲染样例'] as { sample: RenderSample };
  if (sample.trimmed !== 'x' || sample.withUnitsTrimmed !== 'x') {
    throw new Error(
      `trailing-whitespace trim broken: ${JSON.stringify(sample.trimmed)}/${JSON.stringify(sample.withUnitsTrimmed)}`,
    );
  }
  if (!sample.written.endsWith('\n') || sample.written.endsWith('\n\n')) {
    const tail = JSON.stringify(sample.written.slice(-8));
    throw new Error(`written product must end with exactly one newline, tail=${tail}`);
  }
});

// ---------------------------------------------------------------------------
// r18 — locale normalization + fallback chain (unit-level independent fallback)
// ---------------------------------------------------------------------------

interface LocaleSample {
  normalized: Record<string, string>;
  chains: Record<string, string[]>;
  unitResource: string | null;
  skillResource: string | null;
  registryHit: string | null;
}

bdd.given('v2 locale 输入集与双语资源桩', (ctx) => {
  // 资源桩:units/skills/validation-hints 仅 en 存在,skills/propose 仅
  // zh-Hans 存在——同一回退链下两个资源各自独立回退/首命中。
  // (UNIT_FILES 键含子目录,如 units/skills/validation-hints.md。)
  const files = new Set([
    'templates/en/units/skills/validation-hints.md',
    'templates/zh-Hans/skills/llman-sdd-propose.md',
  ]);
  const io = {
    exists: (p: string): boolean => files.has(p),
    readText: (p: string): string => {
      if (!files.has(p)) throw new Error(`stub io missing: ${p}`);
      return p.includes('units/') ? 'UNIT-FROM-EN' : 'SKILL-FROM-ZH-HANS';
    },
  };
  ctx.fixtures['locale样例'] = { io };
  return ctx.fixtures['locale样例'];
});

bdd.when('v2 计算 locale 归一化、回退链与资源回退', (ctx) => {
  const { io } = ctx.fixtures['locale样例'] as {
    io: { exists(p: string): boolean; readText(p: string): string };
  };
  const normalized = {
    'zh-Hans': normalizeLocale('zh-Hans'),
    'zh-CN': normalizeLocale('zh-CN'),
    zh: normalizeLocale('zh'),
    en_US: normalizeLocale('en_US'),
    empty: normalizeLocale(''),
  };
  const chains = {
    'zh-Hans': localeFallbacks('zh-Hans'),
    zh: localeFallbacks('zh'),
    en: localeFallbacks('en'),
  };
  const locales = localeFallbacks('zh-CN');
  const unitResource = loadLocaleResource(
    io,
    'templates',
    locales,
    'units/skills/validation-hints.md',
  );
  const skillResource = loadLocaleResource(io, 'templates', locales, 'skills/llman-sdd-propose.md');
  const registry = loadUnitRegistry(io, 'templates', locales);
  ctx.fixtures['locale样例'] = {
    sample: {
      normalized,
      chains,
      unitResource,
      skillResource,
      registryHit: registry.get('skills/validation-hints') ?? null,
    } satisfies LocaleSample,
  };
});

bdd.thenStep('zh 与 en 变体按映射表归一化且空值回退 en', (ctx) => {
  const { sample } = ctx.fixtures['locale样例'] as { sample: LocaleSample };
  const expected: Record<string, string> = {
    'zh-Hans': 'zh-Hans',
    'zh-CN': 'zh-Hans',
    zh: 'zh-Hans',
    en_US: 'en',
    empty: 'en',
  };
  for (const [input, want] of Object.entries(expected)) {
    if (sample.normalized[input] !== want) {
      throw new Error(`normalizeLocale(${input}) = ${sample.normalized[input]}, want ${want}`);
    }
  }
});

bdd.thenStep('回退链为去重的归一化值语言主部与 en 序列', (ctx) => {
  const { sample } = ctx.fixtures['locale样例'] as { sample: LocaleSample };
  const expected: Record<string, string[]> = {
    'zh-Hans': ['zh-Hans', 'zh', 'en'],
    zh: ['zh-Hans', 'zh', 'en'],
    en: ['en'],
  };
  for (const [input, want] of Object.entries(expected)) {
    if (JSON.stringify(sample.chains[input]) !== JSON.stringify(want)) {
      throw new Error(
        `localeFallbacks(${input}) = ${JSON.stringify(sample.chains[input])}, want ${JSON.stringify(want)}`,
      );
    }
  }
});

bdd.thenStep('资源按 unit 级独立回退且首个命中 locale 生效', (ctx) => {
  const { sample } = ctx.fixtures['locale样例'] as { sample: LocaleSample };
  if (sample.unitResource !== 'UNIT-FROM-EN') {
    throw new Error(`unit resource did not fall back to en: ${String(sample.unitResource)}`);
  }
  if (sample.skillResource !== 'SKILL-FROM-ZH-HANS') {
    throw new Error(`skill resource first-hit broken: ${String(sample.skillResource)}`);
  }
  if (sample.registryHit !== 'UNIT-FROM-EN') {
    throw new Error(`unit registry fallback broken: ${String(sample.registryHit)}`);
  }
});

// ---------------------------------------------------------------------------
// r24 — freeze cold-backup contract through the real CLI (temp workspace)
// ---------------------------------------------------------------------------

interface FreezeFixture {
  root: string;
  run: (args: string[]) => { code: number; stdout: string; stderr: string };
}

interface FreezeResult {
  dry: { code: number; stdout: string; stderr: string };
  /** dry-run 后、真实 freeze 前采样的零变更快照(--dry-run 不做任何变更)。 */
  dryClean: boolean;
  real: { code: number; stdout: string; stderr: string };
  list: { code: number; stdout: string; stderr: string };
}

// 7z 环境守卫:freeze/thaw 的 7z 能力来自打包依赖 7z-wasm(sevenzip.ts 适配,
// 无系统 7z 依赖)。runner 仅支持注册期跳过(静态 @skip 标签/skipScenarios),
// bun:test 无运行时 skip——故守卫为依赖探测快失败:依赖缺失属环境损坏,
// 抛带标记的清晰错误而非静默跳过(与既有 r25 executable 场景同基线)。
let bundledSevenZip: 'ok' | 'missing' = 'missing';
try {
  import.meta.resolve('7z-wasm');
  bundledSevenZip = 'ok';
} catch {
  bundledSevenZip = 'missing';
}

const DATED_DIRS = ['2026-01-01-ancient', '2026-01-02-middle', '2026-01-03-recent'] as const;

bdd.given('一个含三个带日期归档目录的临时仓库', (ctx) => {
  if (bundledSevenZip !== 'ok') {
    throw new Error(
      '[7z 环境守卫] bundled 7z-wasm 依赖不可用——freeze 冷备场景无法执行,请先 bun install',
    );
  }
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-freeze-'));
  for (const dir of DATED_DIRS) {
    const full = join(root, 'llmanspec', 'changes', 'archive', dir);
    mkdirSync(full, { recursive: true });
    writeFileSync(join(full, 'proposal.md'), `# ${dir}\n`);
  }
  ctx.fixtures['freeze仓库'] = {
    root,
    run: (args: string[]) => {
      const proc = runCli(args, root);
      return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
    },
  } satisfies FreezeFixture;
  return ctx.fixtures['freeze仓库'];
});

bdd.when('v2 先 dry-run 再按 before 与 keep-recent 执行 freeze', (ctx) => {
  const repo = ctx.fixtures['freeze仓库'] as FreezeFixture;
  // --before 2026-01-03 候选 = ancient + middle;--keep-recent 1 再按名保留
  // middle → 实际只冻结 ancient。
  const dry = repo.run(['archive', 'freeze', '--dry-run', '--before', '2026-01-03']);
  const archiveDir = join(repo.root, 'llmanspec', 'changes', 'archive');
  const dryClean =
    DATED_DIRS.every((dir) => existsSync(join(archiveDir, dir))) &&
    !existsSync(join(archiveDir, FREEZE_ARCHIVE_NAME));
  const real = repo.run(['archive', 'freeze', '--before', '2026-01-03', '--keep-recent', '1']);
  const list = repo.run(['archive', 'freeze', '--list']);
  ctx.fixtures['freeze结果'] = { dry, dryClean, real, list } satisfies FreezeResult;
});

bdd.thenStep('冷备文件生成且被冻结目录自 archive 删除', (ctx) => {
  const { real } = ctx.fixtures['freeze结果'] as FreezeResult;
  const repo = ctx.fixtures['freeze仓库'] as FreezeFixture;
  if (real.code !== 0) throw new Error(`freeze failed: ${real.stdout}${real.stderr}`);
  const archiveDir = join(repo.root, 'llmanspec', 'changes', 'archive');
  if (!existsSync(join(archiveDir, FREEZE_ARCHIVE_NAME))) {
    throw new Error(`${FREEZE_ARCHIVE_NAME} was not written`);
  }
  if (existsSync(join(archiveDir, '2026-01-01-ancient'))) {
    throw new Error('frozen directory was not removed from changes/archive');
  }
});

bdd.thenStep('dry-run 仅列候选且未做任何变更', (ctx) => {
  const { dry, dryClean } = ctx.fixtures['freeze结果'] as FreezeResult;
  if (dry.code !== 0) throw new Error(`freeze --dry-run failed: ${dry.stdout}${dry.stderr}`);
  for (const name of ['2026-01-01-ancient', '2026-01-02-middle']) {
    if (!dry.stdout.includes(name)) throw new Error(`dry-run candidate missing: ${name}`);
  }
  if (dry.stdout.includes('2026-01-03-recent')) {
    throw new Error('--before cutoff leaked the recent entry into candidates');
  }
  if (!dryClean) {
    throw new Error('--dry-run mutated the workspace (removed a candidate or wrote the archive)');
  }
});

bdd.thenStep('freeze --list 列出冷备条目', (ctx) => {
  const { list } = ctx.fixtures['freeze结果'] as FreezeResult;
  if (list.code !== 0) throw new Error(`freeze --list failed: ${list.stdout}${list.stderr}`);
  if (!list.stdout.includes('2026-01-01-ancient')) {
    throw new Error(`--list output lacks frozen entry:\n${list.stdout}`);
  }
  // --keep-recent 1 语义:middle 按名保留,未入冷备
  if (list.stdout.includes('2026-01-02-middle')) {
    throw new Error('--keep-recent candidate was frozen despite being kept');
  }
});
