// Domain step definitions: init-generators 能力 — 覆盖 r19/r66(渲染 vs
// golden 基线(单内置 zh-Hans)、伦理门)与 r49/r50(init 子目录落点与 --lang 别名)。
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

import { ETHICS_KEYS, runInit, updateFileWithMarkers } from '@llman-sdd/core';

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
// init-generators capability — fresh render vs golden baseline (normalized)
// ---------------------------------------------------------------------------

bdd.given('本仓库的等价 config(zh-Hans 与 bdd 配置)', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-init-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nlocale: zh-Hans\n\nspecs:\n  check_command: "bun test tests/bdd"\n',
  );
  ctx.fixtures['init'] = { root };
});

bdd.when('渲染 propose skill 与 validation-hints 单元', (ctx) => {
  const zhRoot = (ctx.fixtures['init'] as { root: string }).root;
  runInit(
    makeNodeIo(zhRoot),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0', skills: true },
  );
  ctx.fixtures['配对判据产物'] = {
    zh: readFileSync(join(zhRoot, '.agents', 'skills', 'llman-sdd-propose', 'SKILL.md'), 'utf8'),
  };
});

bdd.thenStep('产物含「可执行场景优先」判据小节标识与使用示例', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string };
  if (!r.zh.includes('可执行场景优先判据')) {
    throw new Error('zh-Hans propose render lacks the executable-scenario-first triage section');
  }
});

bdd.thenStep('zh-Hans 产物含该判据', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string };
  if (!r.zh.includes('必须 落成嵌套 `场景:`')) {
    throw new Error('zh-Hans render lacks the triage rule body');
  }
});

// r71: authoring helpers guidance must reach the rendered propose skill
// (structured-adds-first, hand-edit as escape hatch).
bdd.thenStep('zh-Hans 产物含 authoring helpers 引导标识', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string };
  if (!r.zh.includes('结构化新增首选') || !r.zh.includes('spec next-req-id')) {
    throw new Error('zh-Hans propose render lacks the authoring-helpers guidance');
  }
});

bdd.when('渲染全部 skills', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
  runInit(
    makeNodeIo(root),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0', skills: true },
  );
});

// r19: rendered skills tree vs committed golden baseline, version-normalized.
const assertMatchesGoldenBaseline = (producedSkillsDir: string): void => {
  const diffs = diffTrees(
    normalizeTree(join(BASELINE_DIR, 'skills')),
    normalizeTree(producedSkillsDir),
  );
  if (diffs.length > 0) {
    throw new Error(`golden baseline (skills) mismatch:\n${formatTreeDiffs(diffs)}`);
  }
};

bdd.thenStep('与 golden 基线归一化版本号后 diff 为空', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
  assertMatchesGoldenBaseline(join(root, '.agents', 'skills'));
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

// ---------------------------------------------------------------------------
// r50 — 生效 locale 优先级链(config 显式键 > CLI 选项 > 内置默认)与缺键告警
// ---------------------------------------------------------------------------

bdd.given('一个 locale 为 zh-Hans 的已初始化工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-loc-zh-'));
  const seed = runCli(['init', '--locale', 'zh-Hans'], root);
  if ((seed.status ?? 1) !== 0) throw new Error(`seed init failed: ${seed.stderr ?? ''}`);
  ctx.fixtures['init工作区'] = { root };
});

bdd.given('一个 config.yaml 无 locale 键的已初始化工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-loc-nokey-'));
  const seed = runCli(['init', '--locale', 'zh-Hans'], root);
  if ((seed.status ?? 1) !== 0) throw new Error(`seed init failed: ${seed.stderr ?? ''}`);
  const cfg = join(root, 'llmanspec', 'config.yaml');
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(/^locale:.*\n/mu, ''));
  ctx.fixtures['init工作区'] = { root };
});

bdd.when('运行 init --update --locale en', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const proc = runCli(['init', '--update', '--locale', 'en'], root);
  ctx.fixtures['locale结果'] = {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    root,
  };
});

bdd.when('运行 init --update --locale zh-Hans', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const proc = runCli(['init', '--update', '--locale', 'zh-Hans'], root);
  ctx.fixtures['locale结果'] = {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    root,
  };
});

bdd.when('运行 init --update', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const proc = runCli(['init', '--update'], root);
  ctx.fixtures['locale结果'] = {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    root,
  };
});

bdd.thenStep('根 AGENTS.md 托管块仍为 zh-Hans 渲染且 config locale 保持 zh-Hans', (ctx) => {
  const { code, stderr, root } = ctx.fixtures['locale结果'] as {
    code: number;
    stderr: string;
    root: string;
  };
  if (code !== 0) throw new Error(`update failed:\n${stderr}`);
  if (stderr.includes('WARNING')) throw new Error(`unexpected warning:\n${stderr}`);
  if (!readFileSync(join(root, 'AGENTS.md'), 'utf8').includes('LLMAN 规范驱动开发')) {
    throw new Error('root managed block is not zh-Hans rendered');
  }
  if (!/^locale: zh-Hans$/mu.test(readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8'))) {
    throw new Error('config locale was overwritten by the option');
  }
});

bdd.thenStep('根 AGENTS.md 托管块为 zh-Hans 渲染且 stderr 含缺键 WARNING', (ctx) => {
  const { code, stderr, root } = ctx.fixtures['locale结果'] as {
    code: number;
    stderr: string;
    root: string;
  };
  if (code !== 0) throw new Error(`update failed:\n${stderr}`);
  if (!stderr.includes('WARNING') || !stderr.includes("'zh-Hans'")) {
    throw new Error(`missing fallback WARNING:\n${stderr}`);
  }
  if (!readFileSync(join(root, 'AGENTS.md'), 'utf8').includes('LLMAN 规范驱动开发')) {
    throw new Error('root managed block is not zh-Hans rendered');
  }
});

// ---------------------------------------------------------------------------
// r93 — 托管块 marker 更新契约(双齐替换 / 逆序报错 / 缺失前置插入)
// ---------------------------------------------------------------------------

bdd.given('含双标记的 AGENTS.md 内容样例集(块体可替换、END 先于 START、标记缺失)', (ctx) => {
  ctx.fixtures['marker样例'] = {
    ordered: '<!-- LLMANSPEC:START -->\nold body\n<!-- LLMANSPEC:END -->\n\n# Project\n',
    reversed: '<!-- LLMANSPEC:END -->\nold body\n<!-- LLMANSPEC:START -->\n',
    missing: '# Project\n',
  };
});

bdd.when('逐样例执行块体更新', (ctx) => {
  const samples = ctx.fixtures['marker样例'] as {
    ordered: string;
    reversed: string;
    missing: string;
  };
  const results: Record<string, string> = {
    ordered: updateFileWithMarkers(samples.ordered, 'NEW BODY'),
  };
  try {
    updateFileWithMarkers(samples.reversed, 'NEW BODY');
    results['reversed'] = 'no-error';
  } catch {
    results['reversed'] = 'error';
  }
  results['missing'] = updateFileWithMarkers(samples.missing, 'NEW BODY');
  ctx.fixtures['marker结果'] = results;
});

bdd.thenStep(
  '双标记有序样例块体被替换且标记外内容保留、逆序样例报错、缺失样例整块前置插入',
  (ctx) => {
    const r = ctx.fixtures['marker结果'] as Record<string, string>;
    if (!r['ordered']?.includes('NEW BODY') || r['ordered'].includes('old body')) {
      throw new Error(`ordered body not replaced:\n${r['ordered']}`);
    }
    if (!r['ordered'].endsWith('\n\n# Project\n')) {
      throw new Error(`ordered content below END not preserved:\n${r['ordered']}`);
    }
    if (r['reversed'] !== 'error')
      throw new Error(`reversed markers did not error: ${r['reversed']}`);
    const missing = r['missing'] ?? '';
    if (
      !missing.startsWith('<!-- LLMANSPEC:START -->') ||
      !missing.includes('NEW BODY') ||
      !missing.includes('# Project')
    ) {
      throw new Error(`missing-marker sample not prepended:\n${missing}`);
    }
  },
);

// ---------------------------------------------------------------------------
// r97 — 模板文风门随 qa 聚合(check:stc 接线三处一致性,quality-gates 断言复核)
// ---------------------------------------------------------------------------

bdd.thenStep('模板文风门随 qa 聚合运行', (ctx) => {
  const just = readFileSync(join(REPO_ROOT, 'justfile'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const problems: string[] = [];
  if (!/check:stc/u.test(just)) problems.push('justfile qa 缺 check:stc');
  if (pkg.scripts?.['qa'] && !pkg.scripts['qa'].includes('check:stc'))
    problems.push('package.json qa 缺 check:stc');
  const ci = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  if (!ci.includes('bun run check:stc')) problems.push('ci.yml 缺 check:stc run 步');
  if (problems.length > 0) throw new Error(problems.join('; '));
});

// ---------------------------------------------------------------------------
// eval-playbook r86 — auth 注入链随库凭据三层不入库(gitignore 断言)
// ---------------------------------------------------------------------------

bdd.thenStep('gitignore 含 eval-local-results 与 groups-yaml 两行', (ctx) => {
  const gi = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
  const problems: string[] = [];
  if (!/^\.local\/eval\/$/mu.test(gi)) problems.push('.gitignore 缺 .local/eval/(pi-config 所在)');
  if (!/^eval\/groups\.yaml$/mu.test(gi))
    problems.push('.gitignore 缺 eval/groups.yaml(明文密钥合法落点)');
  if (problems.length > 0) throw new Error(problems.join('; '));
});
