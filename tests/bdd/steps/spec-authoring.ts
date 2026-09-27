// Domain step definitions: spec 编写辅助能力 — 覆盖 r41-r43(native v2:
// spec add-req 追加 `规则:` 块 / add-scenario 插入嵌套 `场景:` / resolve-req /
// project dedupe-req-ids)。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCapability } from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI, runCli } from './shared.ts';

// ---------------------------------------------------------------------------
// r41-r43 — spec authoring helpers (acceptance, native v2)
// ---------------------------------------------------------------------------

const AUTHORING_HEAD = `# language: zh-CN
# capability: auth
# purpose: p
# scope: src/

功能: auth

  @req:r1
  规则: 规则甲
    系统 MUST 校验令牌
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
    const proc = runCli(args, root);
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
  if (doc.errors.length !== 0) {
    throw new Error(`appended spec must stay parseable: ${JSON.stringify(doc.errors)}`);
  }
  const r5 = doc.rules.find((r) => r.reqId === 'r5');
  if (!r5 || r5.scenarios.map((s) => s.name).join(',') !== '令牌场景') {
    throw new Error(`appended native rule/scenario not parseable:\n${content}`);
  }
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
  const proc = runCli(['project', 'dedupe-req-ids'], root);
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
  if (!/^  @req:r\d+$/mu.test(billing)) throw new Error(`no remapped id found: ${billing}`);
});

bdd.given('一个目录式布局的临时 specs 目录', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-dir-author-'));
  mkdirSync(join(root, 'llmanspec', 'specs', 'auth'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'specs', 'auth', 'auth.feature'), AUTHORING_HEAD);
  ctx.fixtures['authoring工作区'] = { root };
});

// ---------------------------------------------------------------------------
// r41 — add-req appends a native 规则: block (+@req handle), free-text statement
// ---------------------------------------------------------------------------

interface AddReqNativeResult {
  code: number;
  out: string;
  before: string;
  after: string;
}

bdd.when('以 statement 运行 spec add-req', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const specPath = join(root, 'llmanspec', 'specs', 'auth.feature');
  const before = readFileSync(specPath, 'utf8');
  const proc = spawnSync(
    'bun',
    [
      CLI,
      'spec',
      'add-req',
      'auth',
      'r5',
      '--title',
      '新增规则',
      '--statement',
      '系统必须校验令牌有效期(自由文本)',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  ctx.fixtures['addreq结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    before,
    after: readFileSync(specPath, 'utf8'),
  } satisfies AddReqNativeResult;
});

bdd.thenStep('目标 spec 含 `规则:` 块与 `@req:` 句柄且可被解析', (ctx) => {
  const r = ctx.fixtures['addreq结果'] as AddReqNativeResult;
  if (r.code !== 0) throw new Error(`add-req failed: ${r.out}`);
  if (!r.after.includes('@req:r5') || !r.after.includes('规则: 新增规则')) {
    throw new Error(`native rule block missing:\n${r.after}`);
  }
  const doc = parseCapability(r.after, 'auth.feature');
  const added = doc.rules.find((x) => x.reqId === 'r5');
  if (!added) throw new Error(`appended rule not parseable:\n${r.after}`);
  if (!added.description.includes('校验令牌有效期')) {
    throw new Error(`free-text statement must land in the description:\n${r.after}`);
  }
});

bdd.thenStep('重复 req 报错且 spec 文件零副作用', (ctx) => {
  const r = ctx.fixtures['addreq结果'] as AddReqNativeResult;
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const specPath = join(root, 'llmanspec', 'specs', 'auth.feature');
  const dup = spawnSync(
    'bun',
    [CLI, 'spec', 'add-req', 'auth', 'r5', '--title', '再次新增', '--statement', '另一条描述'],
    { cwd: root, encoding: 'utf8' },
  );
  const out = `${dup.stdout ?? ''}${dup.stderr ?? ''}`;
  if ((dup.status ?? 1) === 0) throw new Error(`duplicate req must be rejected: ${out}`);
  if (!out.includes('r5')) throw new Error(`error must name the duplicated req: ${out}`);
  if (readFileSync(specPath, 'utf8') !== r.after) {
    throw new Error('failed duplicate add-req must not touch the spec file');
  }
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
    const proc = runCli(args, root);
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

bdd.thenStep('存在的 req 追加嵌套场景且 given 缺省为空', (ctx) => {
  const r = ctx.fixtures['addscenario结果'] as AddScenarioResult;
  if (r.okCode !== 0) throw new Error(`add-scenario failed: ${r.okOut}`);
  const doc = parseCapability(r.afterFail, 'auth.feature');
  const acc = doc.rules[0]?.scenarios.find((s) => s.name === '令牌验收');
  if (!acc) throw new Error(`appended nested scenario not parseable:\n${r.afterFail}`);
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
  const proc = runCli(args, root);
  return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
};

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

bdd.thenStep('规则块追加进目录式主文件且无扁平文件被创建', (ctx) => {
  const r = ctx.fixtures['dirlayout结果'] as DirLayoutResult;
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  if (r.okCode !== 0) throw new Error(`add-req failed on directory layout: ${r.okOut}`);
  const content = readFileSync(join(root, 'llmanspec', 'specs', 'auth', 'auth.feature'), 'utf8');
  if (!content.includes('@req:r5') || !content.includes('规则: 用户规则')) {
    throw new Error(`native rule block missing:\n${content}`);
  }
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
  const doc = parseCapability(content, 'auth.feature');
  if (!doc.rules[0]?.scenarios.some((s) => s.name === '令牌验收')) {
    throw new Error(`nested acceptance scenario missing:\n${content}`);
  }
  if (existsSync(join(root, 'llmanspec', 'specs', 'auth.feature'))) {
    throw new Error('flat spec file must not be created');
  }
});

// ---------------------------------------------------------------------------
// r43 — resolve-req statement output + dedupe --dry-run zero side effect
// ---------------------------------------------------------------------------

interface ResolveResult {
  addCode: number;
  addOut: string;
  code: number;
  out: string;
}

bdd.when('运行 spec add-req 后对该 req 运行 spec resolve-req', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const run = (args: string[]): { code: number; out: string } => {
    const proc = runCli(args, root);
    return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
  };
  const statement = '系统必须校验令牌有效期';
  const add = run([
    'spec',
    'add-req',
    'auth',
    'r5',
    '--title',
    '令牌规则',
    '--statement',
    statement,
  ]);
  const resolve = run(['spec', 'resolve-req', 'r5']);
  ctx.fixtures['resolve结果'] = {
    addCode: add.code,
    addOut: add.out,
    code: resolve.code,
    out: resolve.out,
    statement,
  } satisfies ResolveResult & { statement: string };
});

bdd.thenStep('输出含该 capability 与完整 statement', (ctx) => {
  const r = ctx.fixtures['resolve结果'] as ResolveResult & { statement: string };
  if (r.addCode !== 0) throw new Error(`add-req failed: ${r.addOut}`);
  if (r.code !== 0) throw new Error(`resolve-req failed: ${r.out}`);
  if (!r.out.includes('capability: auth')) {
    throw new Error(`resolve output must name the capability:\n${r.out}`);
  }
  if (!r.out.includes(r.statement)) {
    throw new Error(`resolve output must carry the full statement:\n${r.out}`);
  }
});

bdd.when('对不存在的 req 运行 spec resolve-req', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const proc = runCli(['spec', 'resolve-req', 'r99'], root);
  ctx.fixtures['resolve失败'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.thenStep('报错且退出码非零', (ctx) => {
  const r = ctx.fixtures['resolve失败'] as { code: number; out: string };
  if (r.code === 0) throw new Error(`unknown req must fail: ${r.out}`);
  if (!r.out.includes('r99')) throw new Error(`error must name the req: ${r.out}`);
});

interface DedupeDryResult {
  code: number;
  out: string;
  unchanged: boolean;
}

bdd.when('运行 project dedupe-req-ids --dry-run', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const specs = ['auth', 'billing'].map((cap) =>
    join(root, 'llmanspec', 'specs', `${cap}.feature`),
  );
  const before = specs.map((p) => readFileSync(p, 'utf8'));
  const proc = runCli(['project', 'dedupe-req-ids', '--dry-run'], root);
  const after = specs.map((p) => readFileSync(p, 'utf8'));
  ctx.fixtures['dedupedry结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    unchanged: before.every((b, i) => b === after[i]),
  } satisfies DedupeDryResult;
});

bdd.thenStep('输出含重映射计划且两个 spec 文件零副作用', (ctx) => {
  const r = ctx.fixtures['dedupedry结果'] as DedupeDryResult;
  if (r.code !== 0) throw new Error(`dedupe --dry-run failed: ${r.out}`);
  if (!r.out.includes('[dry-run]') || !/r1 → r\d+/u.test(r.out)) {
    throw new Error(`remap plan missing from output:\n${r.out}`);
  }
  if (!r.unchanged) throw new Error('--dry-run must not modify either spec file');
});
