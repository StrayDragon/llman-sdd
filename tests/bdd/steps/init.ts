// Domain step definitions: init-generators 能力 — 覆盖 r19/r66(v2 渲染 vs
// golden 基线、zh-Hans 与 en 双 locale 基线门、双 locale 分流判据、ethics
// 治理门)与 r49/r50(init 子目录落点与 --lang 别名)。
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ETHICS_KEYS, runInit } from '@llman-sdd/core';

import {
  BASELINE_DIR,
  REPO_SKILLS_DIR,
  type TreeDiff,
  assertRepoConfigMatchesGolden,
  diffRepoSkills,
  diffTrees,
  formatTreeDiffs,
  normalizeTree,
} from '../../golden/lib.ts';
import { makeNodeIo } from '../../helpers/nodeIo.ts';
import { bdd } from '../runner.ts';
import { REPO_ROOT, runCli } from './shared.ts';

// ---------------------------------------------------------------------------
// init-generators capability — v2 render vs golden baseline (normalized)
// ---------------------------------------------------------------------------

bdd.given('本仓库的等价 config(zh-Hans 与 bdd 配置)', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-init-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nlocale: zh-Hans\n\nbdd:\n  run_command: "bun test tests/bdd"\n',
  );
  ctx.fixtures['init'] = { root };
});

bdd.given('本仓库的等价 config(en 与 bdd 配置)', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-init-en-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nlocale: en\n\nbdd:\n  run_command: "bun test tests/bdd"\n',
  );
  ctx.fixtures['init'] = { root };
});

bdd.when('渲染 propose skill 与 validation-hints 单元', (ctx) => {
  const zhRoot = (ctx.fixtures['init'] as { root: string }).root;
  runInit(
    makeNodeIo(zhRoot),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0' },
  );
  // en locale 渲染进独立临时目录,断言双 locale 同语义判据
  const enRoot = mkdtempSync(join(tmpdir(), 'llman-sdd-init-en-'));
  mkdirSync(join(enRoot, 'llmanspec'), { recursive: true });
  writeFileSync(join(enRoot, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: en\n');
  runInit(
    makeNodeIo(enRoot),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0' },
  );
  ctx.fixtures['配对判据产物'] = {
    zh: readFileSync(join(zhRoot, '.agents', 'skills', 'llman-sdd-propose', 'SKILL.md'), 'utf8'),
    en: readFileSync(join(enRoot, '.agents', 'skills', 'llman-sdd-propose', 'SKILL.md'), 'utf8'),
  };
});

bdd.thenStep('产物含 @human/@executable 分流判据小节标识', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string; en: string };
  if (!r.zh.includes('@human/@executable 分流判据')) {
    throw new Error('zh-Hans propose render lacks the pairing-triage section');
  }
});

bdd.thenStep('zh-Hans 与 en 产物均含该判据', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string; en: string };
  if (!r.zh.includes('MUST 落成 `@executable` 验收场景')) {
    throw new Error('zh-Hans render lacks the triage rule body');
  }
  if (!r.en.includes('@human/@executable triage')) {
    throw new Error('en propose render lacks the pairing-triage section');
  }
});

// r71: authoring helpers guidance must reach the rendered propose skill in
// both locales (structured-adds-first, hand-edit as escape hatch).
bdd.thenStep('zh-Hans 与 en 产物均含 authoring helpers 引导标识', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string; en: string };
  if (!r.zh.includes('结构化新增首选') || !r.zh.includes('spec next-req-id')) {
    throw new Error('zh-Hans propose render lacks the authoring-helpers guidance');
  }
  if (!r.en.includes('Structured adds preferred') || !r.en.includes('spec next-req-id')) {
    throw new Error('en propose render lacks the authoring-helpers guidance');
  }
});

bdd.when('v2 渲染全部 skills', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
  runInit(
    makeNodeIo(root),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0' },
  );
});

// r19: rendered skills tree vs committed golden baseline, version-normalized.
const assertMatchesGoldenBaseline = (producedSkillsDir: string, locale: 'zh-Hans' | 'en'): void => {
  const subdir = locale === 'en' ? 'skills-en' : 'skills';
  const diffs = diffTrees(
    normalizeTree(join(BASELINE_DIR, subdir)),
    normalizeTree(producedSkillsDir),
  );
  if (diffs.length > 0) {
    throw new Error(`golden baseline (${subdir}) mismatch:\n${formatTreeDiffs(diffs)}`);
  }
};

bdd.thenStep('与 golden 基线归一化版本号后 diff 为空', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
  assertMatchesGoldenBaseline(join(root, '.agents', 'skills'), 'zh-Hans');
});

bdd.thenStep('与 golden en 基线归一化版本号后 diff 为空', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
  assertMatchesGoldenBaseline(join(root, '.agents', 'skills'), 'en');
});

bdd.thenStep('每个 SKILL.md 通过 ethics 治理门', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
  const skillsDir = join(root, '.agents', 'skills');
  for (const dir of readdirSync(skillsDir)) {
    const content = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8');
    for (const key of ETHICS_KEYS) {
      if (!content.includes(key)) throw new Error(`${dir}/SKILL.md missing ethics key ${key}`);
    }
  }
});

// ---------------------------------------------------------------------------
// r80 — repo's own committed skills stay fresh against the golden baseline
// ---------------------------------------------------------------------------

bdd.when('比对仓库自带 skills 与 golden 基线', (ctx) => {
  assertRepoConfigMatchesGolden();
  ctx.fixtures['自带skills差异'] = diffRepoSkills();
});

bdd.thenStep('自带 skills 比对无差异', (ctx) => {
  const diffs = ctx.fixtures['自带skills差异'] as TreeDiff[];
  if (diffs.length > 0) {
    throw new Error(`.agents/skills is stale (run init --update):\n${formatTreeDiffs(diffs)}`);
  }
});

bdd.given('仓库自带 skills 的临时副本中 "{file}" 被改动', (ctx, file) => {
  const copy = mkdtempSync(join(tmpdir(), 'llman-sdd-skills-copy-'));
  cpSync(REPO_SKILLS_DIR, copy, { recursive: true });
  writeFileSync(join(copy, file), `${readFileSync(join(copy, file), 'utf8')}\nstale line\n`);
  ctx.fixtures['自带skills副本'] = { dir: copy, statusBefore: gitStatus() };
});

bdd.when('比对该副本与 golden 基线', (ctx) => {
  const { dir } = ctx.fixtures['自带skills副本'] as { dir: string };
  ctx.fixtures['自带skills差异'] = diffRepoSkills(dir);
});

bdd.thenStep('比对报出 "{file}" 为内容不同', (ctx, file) => {
  const diffs = ctx.fixtures['自带skills差异'] as TreeDiff[];
  if (!diffs.some((d) => d.file === file && d.kind === 'changed')) {
    throw new Error(`expected ${file} reported as changed, got:\n${formatTreeDiffs(diffs)}`);
  }
});

bdd.thenStep('仓库工作区未被改动', (ctx) => {
  const { statusBefore } = ctx.fixtures['自带skills副本'] as { statusBefore: string };
  if (gitStatus() !== statusBefore) throw new Error('repo working tree changed during the check');
});

function gitStatus(): string {
  return spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout;
}

// ---------------------------------------------------------------------------
// r49/r50 — init path & --lang alias (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个空的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-initcli-'));
  ctx.fixtures['init工作区'] = { root };
});

bdd.when('运行 init 指向不存在的子目录', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const proc = runCli(['init', 'deep/nested/proj'], root);
  ctx.fixtures['init结果'] = { code: proc.status ?? 1, root };
});

bdd.thenStep('产物面完整落在该子目录下', (ctx) => {
  const { code, root } = ctx.fixtures['init结果'] as { code: number; root: string };
  if (code !== 0) throw new Error('init to subdirectory failed');
  for (const rel of [
    'deep/nested/proj/llmanspec/config.yaml',
    'deep/nested/proj/AGENTS.md',
    'deep/nested/proj/.agents/skills',
  ]) {
    if (!existsSync(join(root, rel))) throw new Error(`missing: ${rel}`);
  }
});

bdd.when('运行 init --lang zh-Hans', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const alias = runCli(['init', '--lang', 'zh-Hans'], root);
  const both = runCli(['init', '--lang', 'en', '--locale', 'zh-Hans'], root);
  ctx.fixtures['lang结果'] = {
    aliasCode: alias.status ?? 1,
    bothCode: both.status ?? 0,
    root,
  };
});

bdd.thenStep('config locale 为 zh-Hans 且同给两个别名报错', (ctx) => {
  const { aliasCode, bothCode, root } = ctx.fixtures['lang结果'] as {
    aliasCode: number;
    bothCode: number;
    root: string;
  };
  if (aliasCode !== 0) throw new Error('--lang alias failed');
  if (bothCode === 0) throw new Error('giving both aliases should fail');
  const config = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
  if (!config.includes('zh-Hans')) throw new Error(`locale not zh-Hans:\n${config}`);
});
