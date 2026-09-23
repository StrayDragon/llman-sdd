// Domain step definitions: config 能力 — 覆盖 r5/r6(顶层字段域与未知键宽容,
// 含 extra_skills 内联加载步骤)、r37/r38(config 概览与 skills 管理)、
// r59/r60(change_id pattern 校验与 template 渲染)。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI, type TempRepo, field, makeTempRepo, seedChange } from './shared.ts';

bdd.given('一个 config 内容 extra_skills 含 "{value}"', (ctx, value) => {
  ctx.fixtures['config'] = { 源文本: `schema: spec-driven\nextra_skills:\n  - ${value}\n` };
  return ctx.fixtures['config'];
});

bdd.when('加载该 config', (ctx) => {
  const source = String(field(ctx.fixtures['config'], '源文本') ?? '');
  try {
    loadConfig(source);
    ctx.fixtures['加载结果'] = { error: null };
  } catch (err) {
    ctx.fixtures['加载结果'] = { error: (err as Error).message };
  }
});

bdd.thenStep('报错信息包含 "{text}"', (ctx, text) => {
  const message = String(field(ctx.fixtures['加载结果'], 'error') ?? '');
  if (!message) throw new Error('no error was captured by 当 加载该 config');
  if (!message.includes(text))
    throw new Error(`error message does not contain "${text}":\n${message}`);
});

bdd.thenStep('报错条数至多 {count:d}', (ctx, count) => {
  const message = String(field(ctx.fixtures['加载结果'], 'error') ?? '');
  const lines = message.split('\n').filter((l) => l.startsWith('- '));
  if (lines.length > count)
    throw new Error(`expected at most ${count} issue lines, got ${lines.length}`);
});

// ---------------------------------------------------------------------------
// r37/r38 — config overview & extra_skills management (acceptance)
// ---------------------------------------------------------------------------

interface ConfigFixture {
  root: string;
  original: string;
}

bdd.given('一个带注释与 extra_skills 的 llmanspec config', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-config-'));
  const original = [
    '# yaml-language-server: $schema=https://x/y.json',
    'schema: spec-driven',
    '# 用户注释保留',
    'extra_skills:',
    '  - llman-sdd-ff',
    '',
  ].join('\n');
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), original);
  ctx.fixtures['config工作区'] = { root, original } satisfies ConfigFixture;
});

bdd.when('运行 v2 的 config 概览', (ctx) => {
  const { root, original } = ctx.fixtures['config工作区'] as ConfigFixture;
  const proc = spawnSync('bun', [CLI, 'config'], { cwd: root, encoding: 'utf8' });
  const after = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
  ctx.fixtures['概览结果'] = {
    out: proc.stdout ?? '',
    unchanged: after === original,
  };
});

bdd.thenStep('概览五要素输出且文件未被修改', (ctx) => {
  const { out, unchanged } = ctx.fixtures['概览结果'] as { out: string; unchanged: boolean };
  for (const marker of [
    'schema:',
    'locale:',
    'extra_skills (enabled/total): 1 / 6',
    'bdd: off',
    'archive: default',
  ]) {
    if (!out.includes(marker)) throw new Error(`overview missing ${marker}:\n${out}`);
  }
  if (!unchanged) throw new Error('config overview modified config.yaml');
});

bdd.when('运行 v2 的 config skills --json', (ctx) => {
  const { root } = ctx.fixtures['config工作区'] as ConfigFixture;
  const proc = spawnSync('bun', [CLI, 'config', 'skills', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['skillsjson'] = {
    code: proc.status ?? 0,
    out: proc.stdout ?? '',
    err: proc.stderr ?? '',
  };
});

bdd.thenStep('JSON 输出 {enabled, available} 且 --set 为未知选项', (ctx) => {
  const { root, original } = ctx.fixtures['config工作区'] as ConfigFixture;
  const r = ctx.fixtures['skillsjson'] as { code: number; out: string; err: string };
  if (r.code !== 0) throw new Error(`config skills --json failed: ${r.err}`);
  const parsed = JSON.parse(r.out) as { enabled: string[]; available: string[] };
  if (!Array.isArray(parsed.enabled) || parsed.available.length !== 6)
    throw new Error(`shape wrong: ${r.out}`);
  // v1 parity: --set/--unset are NOT part of the flag surface (clap rc=2).
  const set = spawnSync('bun', [CLI, 'config', 'skills', '--set', 'llman-sdd-validate'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (set.status !== 2)
    throw new Error(`--set must be an unknown option (rc=2), got ${set.status}`);
  const after = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
  if (after !== original) throw new Error('--set must not write config');
});

// ---------------------------------------------------------------------------
// r59/r60 — change_id pattern & template (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个配置了纯数字前缀 pattern 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nchange_id:\n  pattern: "^[0-9]+-[a-z0-9-]+$"\n',
  );
  seedChange(repo, 'bad-id');
  ctx.fixtures['pattern仓库'] = { repo };
});

bdd.when('创建不匹配的 change 并运行 validate', (ctx) => {
  const { repo } = ctx.fixtures['pattern仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', 'bad-id', '--no-check']);
  ctx.fixtures['pattern结果'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('该 change 判 ERROR 且非法正则加载即报错', (ctx) => {
  const r = ctx.fixtures['pattern结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`pattern violation should fail: ${r.stdout}${r.stderr}`);
  if (!`${r.stdout}${r.stderr}`.includes('change_id.pattern')) {
    throw new Error(`pattern message missing: ${r.stdout}${r.stderr}`);
  }
});

bdd.given('一个配置了 change_id.template 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nchange_id:\n  template: "c{{ llman_sdd_unique_id }}-{{ verb }}-{{ subject }}"\n',
  );
  ctx.fixtures['template仓库'] = { repo };
});

bdd.when('运行 change new --from 并带 --verb', (ctx) => {
  const { repo } = ctx.fixtures['template仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [
    CLI,
    'change',
    'new',
    '--from',
    'port the importer module',
    '--verb',
    'port',
  ]);
  ctx.fixtures['template结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('派生 id 由模板渲染生成', (ctx) => {
  const r = ctx.fixtures['template结果'] as { code: number; stdout: string; stderr: string };
  const { repo } = ctx.fixtures['template仓库'] as { repo: TempRepo };
  if (r.code !== 0) throw new Error(`template render failed: ${r.stdout}${r.stderr}`);
  if (!r.stdout.includes('c1-port-port-the-importer-module')) {
    throw new Error(`rendered id mismatch: ${r.stdout}${r.stderr}`);
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'c1-port-port-the-importer-module'))) {
    throw new Error('rendered change dir missing');
  }
});

// ---------------------------------------------------------------------------
// r5 — config top-level field domain + unknown-key tolerance (acceptance)
// ---------------------------------------------------------------------------

const FULL_CONFIG = `schema: spec-driven
locale: zh-Hans
extra_skills:
  - llman-sdd-ff
archive:
  strict_defer: true
bdd:
  run_command: "bun test tests/bdd"
sdd:
  merge_method: squash
change_id:
  pattern: "^[a-z0-9][a-z0-9-]*$"
unknown_toplevel: tolerated
`;

bdd.given('一个含全部顶层字段与未知字段的 config 内容', (ctx) => {
  ctx.fixtures['config'] = { 源文本: FULL_CONFIG };
  return ctx.fixtures['config'];
});

bdd.thenStep('加载成功且未知字段宽松放行', (ctx) => {
  const result = ctx.fixtures['加载结果'] as { error: string | null } | undefined;
  if (!result) throw new Error('no 加载结果 — did the 当 step run?');
  if (result.error !== null) {
    throw new Error(`unknown fields must be tolerated, got:\n${result.error}`);
  }
  const source = String(field(ctx.fixtures['config'], '源文本') ?? '');
  const parsed = loadConfig(source);
  if (parsed.schema !== 'spec-driven') throw new Error('schema field must round-trip');
  if (parsed.locale !== 'zh-Hans') throw new Error('locale field must round-trip');
  if (parsed.sdd?.merge_method !== 'squash') throw new Error('sdd.merge_method must round-trip');
  if (parsed.change_id?.pattern === undefined) throw new Error('change_id.pattern must round-trip');
});

bdd.thenStep('schema 非法值报错', (ctx) => {
  let message: string | null = null;
  try {
    loadConfig('schema: bogus\n');
  } catch (error) {
    message = (error as Error).message;
  }
  if (message === null) throw new Error('schema: bogus must be rejected');
  if (!message.includes('schema')) {
    throw new Error(`error must name the schema field: ${message}`);
  }
});
