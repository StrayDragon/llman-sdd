// Domain step definitions: init-generators 能力 — 覆盖 r19/r66(v2 渲染 vs
// golden 基线、双 locale 分流判据、ethics 治理门)与 r49/r50(init 子目录
// 落点与 --lang 别名)。
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ETHICS_KEYS, runInit } from '@llman-sdd/core';

import { makeNodeIo } from '../../helpers/nodeIo.ts';
import { bdd } from '../runner.ts';
import { CLI } from './shared.ts';

// ---------------------------------------------------------------------------
// init-generators capability — v2 render vs golden baseline (normalized)
// ---------------------------------------------------------------------------

bdd.given('本仓库的等价 config(zh-Hans 与 bdd 配置)', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-init-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nlocale: zh-Hans\n\nbdd:\n  run_command: "bun test tests/bdd"\n  bindings:\n    - kind: tags\n      tags: [executable]\n',
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

bdd.thenStep('与 golden 基线归一化版本号后 diff 为空', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
  const baselineDir = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'tests',
    'golden',
    'baseline',
    'skills',
  );
  const versionRe = /\b\d+\.\d+\.\d+\b/gu;
  const readTree = (dir: string): Map<string, string> => {
    const out = new Map<string, string>();
    const walk = (rel: string): void => {
      for (const name of readdirSync(join(dir, rel)).toSorted()) {
        const child = rel === '' ? name : `${rel}/${name}`;
        if (statSync(join(dir, child)).isDirectory()) walk(child);
        else out.set(child, readFileSync(join(dir, child), 'utf8').replaceAll(versionRe, '<VER>'));
      }
    };
    walk('');
    return out;
  };
  const baseline = readTree(baselineDir);
  const produced = readTree(join(root, '.agents', 'skills'));
  for (const [file, content] of baseline) {
    if (produced.get(file) !== content) {
      throw new Error(`rendered product ${file} differs from golden baseline`);
    }
  }
  if (produced.size !== baseline.size) {
    throw new Error(`file count mismatch: baseline ${baseline.size} vs v2 ${produced.size}`);
  }
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
// r49/r50 — init path & --lang alias (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个空的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-initcli-'));
  ctx.fixtures['init工作区'] = { root };
});

bdd.when('运行 init 指向不存在的子目录', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'init', 'deep/nested/proj'], { cwd: root, encoding: 'utf8' });
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
  const alias = spawnSync('bun', [CLI, 'init', '--lang', 'zh-Hans'], {
    cwd: root,
    encoding: 'utf8',
  });
  const both = spawnSync('bun', [CLI, 'init', '--lang', 'en', '--locale', 'zh-Hans'], {
    cwd: root,
    encoding: 'utf8',
  });
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
