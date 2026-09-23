// Domain step definitions: spec 编写辅助能力 — 覆盖 r41-r43(spec add-req /
// add-scenario / resolve-req / project dedupe-req-ids)与 r42(追加验收场景
// 成功 + 缺失 req 零副作用)。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCapability } from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI } from './shared.ts';

// ---------------------------------------------------------------------------
// r41-r43 — spec authoring helpers (acceptance)
// ---------------------------------------------------------------------------

const AUTHORING_HEAD = `# language: zh-CN
# capability: auth
# purpose: p
# scope: src/

功能: auth

  @req:r1 @human
  场景: 规则甲
    - 系统 MUST 校验令牌
`;

bdd.given('一个含单一 capability spec 的临时 specs 目录', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-author-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'specs', 'auth.feature'), AUTHORING_HEAD);
  ctx.fixtures['authoring工作区'] = { root };
});

bdd.when('运行 spec add-req 与 spec add-scenario', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const run = (args: string[]): { code: number; out: string } => {
    const proc = spawnSync('bun', [CLI, ...args], { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
  };
  const r1 = run([
    'spec',
    'add-req',
    'auth',
    'r5',
    '--title',
    '用户规则',
    '--statement',
    '系统必须校验令牌',
  ]);
  const r2 = run([
    'spec',
    'add-scenario',
    'auth',
    'r5',
    '令牌场景',
    '--when',
    '访问受保护资源',
    '--then',
    '访问被允许',
  ]);
  const r3 = run(['spec', 'resolve-req', 'r5']);
  ctx.fixtures['authoring结果'] = { results: [r1, r2, r3], root };
});

bdd.thenStep('spec 可被解析且 resolve-req 反查一致', (ctx) => {
  const { results, root } = ctx.fixtures['authoring结果'] as {
    results: { code: number; out: string }[];
    root: string;
  };
  for (const [i, r] of results.entries()) {
    if (r.code !== 0) throw new Error(`authoring step ${i} failed: ${r.out}`);
  }
  const content = readFileSync(join(root, 'llmanspec', 'specs', 'auth.feature'), 'utf8');
  const doc = parseCapability(content, 'auth.feature');
  if (doc.scenarios.length < 3) throw new Error(`appended scenarios not parseable: ${content}`);
  if (!content.includes('@req:r5 @executable')) throw new Error('acceptance scenario missing');
});

bdd.given('一个两个 spec 含相同 rN 的临时 specs 目录', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-dedupe-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  for (const cap of ['auth', 'billing']) {
    writeFileSync(
      join(root, 'llmanspec', 'specs', `${cap}.feature`),
      AUTHORING_HEAD.replace('capability: auth', `capability: ${cap}`).replace(
        '功能: auth',
        `功能: ${cap}`,
      ),
    );
  }
  ctx.fixtures['authoring工作区'] = { root };
});

bdd.when('运行 project dedupe-req-ids', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'project', 'dedupe-req-ids'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['dedupe结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    root,
  };
});

bdd.thenStep('后一个文件的 rN 被重映射为空闲 id', (ctx) => {
  const { code, out, root } = ctx.fixtures['dedupe结果'] as {
    code: number;
    out: string;
    root: string;
  };
  if (code !== 0) throw new Error(`dedupe failed: ${out}`);
  const billing = readFileSync(join(root, 'llmanspec', 'specs', 'billing.feature'), 'utf8');
  if (billing.includes('@req:r1')) throw new Error('billing still carries the colliding r1');
  if (!/ @req:r\d+ @human/u.test(billing)) throw new Error(`no remapped id found: ${billing}`);
});

// ---------------------------------------------------------------------------
// r42 — spec add-scenario append success + missing-req zero side effect
// ---------------------------------------------------------------------------

interface AddScenarioResult {
  okCode: number;
  okOut: string;
  failCode: number;
  failOut: string;
  beforeFail: string;
  afterFail: string;
}

bdd.when('运行 spec add-scenario 指向存在的 req 与不存在的 req', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const run = (args: string[]): { code: number; out: string } => {
    const proc = spawnSync('bun', [CLI, ...args], { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
  };
  const ok = run([
    'spec',
    'add-scenario',
    'auth',
    'r1',
    '令牌验收',
    '--when',
    '访问受保护资源',
    '--then',
    '访问被允许',
  ]);
  const specPath = join(root, 'llmanspec', 'specs', 'auth.feature');
  const beforeFail = readFileSync(specPath, 'utf8');
  const fail = run([
    'spec',
    'add-scenario',
    'auth',
    'r99',
    '幽灵场景',
    '--when',
    '触发门',
    '--then',
    '门被拦截',
  ]);
  const afterFail = readFileSync(specPath, 'utf8');
  ctx.fixtures['addscenario结果'] = {
    okCode: ok.code,
    okOut: ok.out,
    failCode: fail.code,
    failOut: fail.out,
    beforeFail,
    afterFail,
  } satisfies AddScenarioResult;
});

bdd.thenStep('存在的 req 追加 @executable 验收场景且 given 缺省为空', (ctx) => {
  const r = ctx.fixtures['addscenario结果'] as AddScenarioResult;
  if (r.okCode !== 0) throw new Error(`add-scenario failed: ${r.okOut}`);
  if (!r.afterFail.includes('@req:r1 @executable')) {
    throw new Error(`acceptance scenario tag missing:\n${r.afterFail}`);
  }
  const doc = parseCapability(r.afterFail, 'auth.feature');
  const acc = doc.scenarios.find(
    (s) => s.classification === 'executable' && s.reqIds.includes('r1'),
  );
  if (!acc) throw new Error(`appended scenario not parseable:\n${r.afterFail}`);
  const kinds = acc.steps.map((s) => s.kind);
  if (JSON.stringify(kinds) !== JSON.stringify(['when', 'then'])) {
    throw new Error(`given must default to empty; got steps [${kinds.join(', ')}]`);
  }
});

bdd.thenStep('不存在的 req 报错且文件零副作用', (ctx) => {
  const r = ctx.fixtures['addscenario结果'] as AddScenarioResult;
  if (r.failCode === 0) throw new Error(`missing req must fail: ${r.failOut}`);
  if (!r.failOut.includes('r99')) {
    throw new Error(`error must name the missing req: ${r.failOut}`);
  }
  if (r.beforeFail !== r.afterFail) {
    throw new Error('failed add-scenario must not touch the spec file');
  }
});

// ---------------------------------------------------------------------------
// r41/r42 — directory-style layout auto-discovery (write-target caliber)
// ---------------------------------------------------------------------------

interface DirLayoutResult {
  okCode: number;
  okOut: string;
  failCode: number;
  failOut: string;
  beforeFail: string;
}

const dirLayoutRun = (root: string, args: string[]): { code: number; out: string } => {
  const proc = spawnSync('bun', [CLI, ...args], { cwd: root, encoding: 'utf8' });
  return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
};

bdd.given('一个目录式布局的临时 specs 目录', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-dir-author-'));
  mkdirSync(join(root, 'llmanspec', 'specs', 'auth'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'specs', 'auth', 'auth.feature'), AUTHORING_HEAD);
  ctx.fixtures['authoring工作区'] = { root };
});

bdd.when('运行 spec add-req 指向该 capability 与指向不存在的 capability', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const ok = dirLayoutRun(root, [
    'spec',
    'add-req',
    'auth',
    'r5',
    '--title',
    '用户规则',
    '--statement',
    '系统必须校验令牌',
  ]);
  const beforeFail = readFileSync(join(root, 'llmanspec', 'specs', 'auth', 'auth.feature'), 'utf8');
  const fail = dirLayoutRun(root, [
    'spec',
    'add-req',
    'ghost',
    'r9',
    '--title',
    '幽灵规则',
    '--statement',
    '系统必须不存在',
  ]);
  ctx.fixtures['dirlayout结果'] = {
    okCode: ok.code,
    okOut: ok.out,
    failCode: fail.code,
    failOut: fail.out,
    beforeFail,
  };
});

bdd.thenStep('规则场景追加进目录式主文件且无扁平文件被创建', (ctx) => {
  const r = ctx.fixtures['dirlayout结果'] as DirLayoutResult;
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  if (r.okCode !== 0) throw new Error(`add-req failed on directory layout: ${r.okOut}`);
  const content = readFileSync(join(root, 'llmanspec', 'specs', 'auth', 'auth.feature'), 'utf8');
  if (!content.includes('@req:r5 @human')) throw new Error(`rule scenario missing:\n${content}`);
  if (existsSync(join(root, 'llmanspec', 'specs', 'auth.feature'))) {
    throw new Error('flat spec file must not be created');
  }
});

bdd.thenStep('不存在的 capability 报错且零副作用', (ctx) => {
  const r = ctx.fixtures['dirlayout结果'] as DirLayoutResult;
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  if (r.failCode === 0) throw new Error(`missing capability must fail: ${r.failOut}`);
  const after = readFileSync(join(root, 'llmanspec', 'specs', 'auth', 'auth.feature'), 'utf8');
  if (after !== r.beforeFail) throw new Error('failed add-req must not touch the spec file');
});

bdd.when('运行 spec add-scenario 指向该 capability 存在的 req', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const r = dirLayoutRun(root, [
    'spec',
    'add-scenario',
    'auth',
    'r1',
    '令牌验收',
    '--when',
    '访问受保护资源',
    '--then',
    '访问被允许',
  ]);
  ctx.fixtures['dirscenario结果'] = r;
});

bdd.thenStep('验收场景追加进目录式主文件且无扁平文件被创建', (ctx) => {
  const r = ctx.fixtures['dirscenario结果'] as { code: number; out: string };
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  if (r.code !== 0) throw new Error(`add-scenario failed on directory layout: ${r.out}`);
  const content = readFileSync(join(root, 'llmanspec', 'specs', 'auth', 'auth.feature'), 'utf8');
  if (!content.includes('@req:r1 @executable')) {
    throw new Error(`acceptance scenario missing:\n${content}`);
  }
  if (existsSync(join(root, 'llmanspec', 'specs', 'auth.feature'))) {
    throw new Error('flat spec file must not be created');
  }
});
