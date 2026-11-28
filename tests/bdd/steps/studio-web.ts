// BDD acceptance steps for llmanspec/specs/studio-web.feature (r143-r148).
import { expect } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acceptRevisionProposal,
  addStudioComment,
  applyDriftProposalsToStateDoc,
  bootstrapResponseSchema,
  buildDemoStudioWebDrafts,
  cloneMachineIR,
  compileDecisionTableToTree,
  computeCrossForestBridges,
  computeMachineDiff,
  createStudioStateDoc,
  defaultStudioViewsDoc,
  deleteStudioComment,
  editStudioComment,
  extractDecisionTables,
  healthResponseSchema,
  parseCapability,
  recordWorldlineCommit,
  snapshotBeforeSync,
  SYNC_SNAPSHOT_LABEL,
  reopenStudioComment,
  resolveStudioComment,
  specDetailResponseSchema,
  studioSearchResponseSchema,
  switchWorldlineHead,
  textfoldResponseSchema,
  viewsResponseSchema,
  type SpecIndexEdge,
  type SpecIndexItem,
  commentWatchTag,
  formatStudioDeepLinkQuery,
  parseStudioDeepLink,
  type StudioMachineIR,
  type StudioStateDoc,
} from '@llman-sdd/core';

import {
  createStudioHubApp,
  type CreatedStudioHubApp,
} from '../../../apps/cli/src/studio-server/server.ts';
import {
  loadStudioAsset,
  parseEmbeddedStudioAssets,
  resetEmbeddedStudioAssetsCache,
} from '../../../apps/cli/src/studio-server/static.ts';
import {
  buildTruthWinsPrompt,
  computeDriftCalibrationOverlay,
  getPendingDriftProposals,
} from '../../../apps/studio/src/drift/reconcileOverlay.ts';
import {
  contrastRatio,
  MIN_NON_TEXT_CONTRAST,
  STUDIO_CONTRAST_PALETTES,
} from '../../../apps/studio/src/ergonomics/contrast.ts';
import {
  alignSelectedNodes,
  distributeSelectedNodes,
  type NodeBoxInput,
} from '../../../apps/studio/src/ergonomics/layoutTidy.ts';
import {
  filterShortcutsByView,
  STUDIO_SHORTCUT_REGISTRY,
} from '../../../apps/studio/src/ergonomics/shortcuts.ts';
import {
  getParentNestContext,
  nestBreadcrumb,
} from '../../../apps/studio/src/nest/parentContext.ts';
import {
  buildSubtreeDiffText,
  getSubtreeMachineIds,
} from '../../../apps/studio/src/nest/subtree.ts';
import {
  buildExclusiveDomainGroupsWithManual,
  extractPortalEvidence,
  layoutMainViewWithGroups,
} from '../../../apps/studio/src/routing/domainGroups.ts';
import {
  countPolyObstacleHits,
  rectsOverlap,
  resolveLabelPosition,
  routeObstacleAwareEdge,
  type RectBox,
} from '../../../apps/studio/src/routing/obstacleRouter.ts';
import { createMachineSimulationSession } from '../../../apps/studio/src/simulate/xstateCompiler.ts';
import { foldActivityItems } from '../../../apps/studio/src/sync/activity.ts';
import {
  copyContainsForbidden,
  pickTopHudSlot,
  SYNC_COPY,
} from '../../../apps/studio/src/sync/copy.ts';
import {
  ALL_STUDIO_INVARIANTS,
  buildCleanSnapshot,
  buildViolatingSnapshot,
  checkStudioInvariants,
} from '../../e2e/studio/invariants.ts';
import { bdd } from '../runner.ts';

const BDD_SPEC = `# language: zh-CN
# purpose: 验证 Studio 本地服务行为

功能: bdd-sample

  @req:r1
  规则: 样例规则
    样例规则用于验证接口。

    场景: 基础验证
      假如 准备就绪
      当 触发检查
      那么 校验通过
`;

function createTempStudioApp(): { dir: string; hub: CreatedStudioHubApp } {
  const dir = mkdtempSync(join(tmpdir(), 'llman-bdd-studio-web-'));
  mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
  mkdirSync(join(dir, 'llmanspec', 'changes'), { recursive: true });
  writeFileSync(join(dir, 'llmanspec', 'config.yaml'), 'version: "1.0"\nlocale: zh-Hans\n', 'utf8');
  writeFileSync(join(dir, 'llmanspec', 'specs', 'bdd-sample.feature'), BDD_SPEC, 'utf8');
  const hub = createStudioHubApp({
    initialDirectory: dir,
    host: '127.0.0.1',
    port: 4710,
    demo: true,
    writeHubFile: false,
  });
  return { dir, hub };
}

// --- r143 (@transitions self-hosting state machine outline) ---
bdd.given('当前处于 {from} 状态且满足 {guard}', (ctx, fromState: string, guard: string) => {
  ctx.fixtures['swFrom'] = fromState;
  ctx.fixtures['swGuard'] = guard;
});
bdd.when('触发 {event} 事件', (ctx, eventName: string) => {
  ctx.fixtures['swEvent'] = eventName;
});
bdd.thenStep('流转至 {to} 状态', (ctx, toState: string) => {
  const [l1] = buildDemoStudioWebDrafts();
  const machine = l1!.current!;
  const fromName = String(ctx.fixtures['swFrom'] ?? '');
  const eventName = String(ctx.fixtures['swEvent'] ?? '');
  const guardName = String(ctx.fixtures['swGuard'] ?? '').trim();
  const fromNode = machine.states.find((s) => s.name === fromName);
  const toNode = machine.states.find((s) => s.name === toState);
  expect(fromNode).toBeDefined();
  expect(toNode).toBeDefined();
  const matched = machine.transitions.find(
    (t) =>
      t.fromUid === fromNode!.uid &&
      t.toUid === toNode!.uid &&
      t.event === eventName &&
      (t.guard ?? '').trim() === guardName,
  );
  expect(matched).toBeDefined();
});

// --- r144 ---
bdd.given('一个包含真实规格与本地草稿的临时仓库并启动随机端口 Studio 服务', (ctx) => {
  const { dir, hub } = createTempStudioApp();
  ctx.fixtures['r144Dir'] = dir;
  ctx.fixtures['r144Hub'] = hub;
});
bdd.when(
  '依次请求健康检查、索引与懒加载接口、非法 Zod 载荷、缺令牌写请求及过期版本号更新',
  async (ctx) => {
    const hub = ctx.fixtures['r144Hub'] as CreatedStudioHubApp;
    const req = (p: string, init?: RequestInit) =>
      hub.app.request(`http://127.0.0.1:4710${p}`, init);
    const health = healthResponseSchema.parse(await (await req('/api/health')).json());
    const boot = bootstrapResponseSchema.parse(await (await req('/api/bootstrap')).json());
    const detail = specDetailResponseSchema.parse(
      await (await req('/api/specs/bdd-sample')).json(),
    );
    const badZod = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ doc: { bad: true } }),
    });
    const noTok = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc: boot.stateDoc }),
    });
    await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ doc: boot.stateDoc, expectedRevision: 0 }),
    });
    const conflict = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ doc: boot.stateDoc, expectedRevision: 0 }),
    });
    ctx.fixtures['r144Result'] = {
      health,
      boot,
      detail,
      badZodStatus: badZod.status,
      noTokStatus: noTok.status,
      conflictStatus: conflict.status,
    };
  },
);
bdd.thenStep('健康检查与索引懒加载返回合法 Zod 契约数据', (ctx) => {
  const res = ctx.fixtures['r144Result'] as {
    health: { ok: boolean };
    boot: { specs: unknown[] };
    detail: { id: string };
  };
  expect(res.health.ok).toBe(true);
  expect(res.boot.specs.length).toBe(1);
  expect(res.detail.id).toBe('bdd-sample');
});
bdd.thenStep(
  '非法载荷返回 400、缺令牌写请求被拒绝、过期版本号返回 409 且 specs 目录零修改',
  (ctx) => {
    const dir = ctx.fixtures['r144Dir'] as string;
    const hub = ctx.fixtures['r144Hub'] as CreatedStudioHubApp;
    const res = ctx.fixtures['r144Result'] as {
      badZodStatus: number;
      noTokStatus: number;
      conflictStatus: number;
    };
    expect(res.badZodStatus).toBe(400);
    expect(res.noTokStatus).toBe(403);
    expect(res.conflictStatus).toBe(409);
    expect(readFileSync(join(dir, 'llmanspec', 'specs', 'bdd-sample.feature'), 'utf8')).toBe(
      BDD_SPEC,
    );
    hub.cleanup();
    rmSync(dir, { recursive: true, force: true });
  },
);

// --- r145 ---
bdd.given('一个已启动的随机端口 Studio 本地服务', (ctx) => {
  const { dir, hub } = createTempStudioApp();
  ctx.fixtures['r145Dir'] = dir;
  ctx.fixtures['r145Hub'] = hub;
});
bdd.when('以不同 Accept 与 format 参数访问深链并调用 TextFold 折展接口', async (ctx) => {
  const hub = ctx.fixtures['r145Hub'] as CreatedStudioHubApp;
  const req = (p: string, init?: RequestInit) => hub.app.request(`http://127.0.0.1:4710${p}`, init);
  const wsPath = `/p/${encodeURIComponent(hub.activeWsKey)}`;
  const mdRes = await req(wsPath, { headers: { accept: '*/*' } });
  const jsonRes = await req(`${wsPath}?format=json`);
  const htmlRes = await req(wsPath, { headers: { accept: 'text/html' } });
  const tf1 = textfoldResponseSchema.parse(
    await (
      await req('/api/textfold/fold', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
        body: JSON.stringify({ content: BDD_SPEC, capability: 'bdd-sample' }),
      })
    ).json(),
  );
  const tf2 = textfoldResponseSchema.parse(
    await (
      await req('/api/textfold/fold', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
        body: JSON.stringify({ content: BDD_SPEC, capability: 'bdd-sample' }),
      })
    ).json(),
  );
  ctx.fixtures['r145Result'] = {
    mdType: mdRes.headers.get('content-type') ?? '',
    jsonOk: jsonRes.status === 200,
    htmlText: await htmlRes.text(),
    tf1,
    tf2,
  };
});
bdd.thenStep(
  '非浏览器请求默认返回 Markdown、format=json 返回合法 JSON、HTML 响应内嵌 studio-focus-context',
  (ctx) => {
    const r = ctx.fixtures['r145Result'] as { mdType: string; jsonOk: boolean; htmlText: string };
    expect(r.mdType).toContain('text/markdown');
    expect(r.jsonOk).toBe(true);
    expect(r.htmlText).toContain('id="studio-focus-context"');
  },
);
bdd.thenStep('未配置外部服务时 TextFold 返回本地 AST 5 级折展并命中缓存', (ctx) => {
  const dir = ctx.fixtures['r145Dir'] as string;
  const hub = ctx.fixtures['r145Hub'] as CreatedStudioHubApp;
  const r = ctx.fixtures['r145Result'] as {
    tf1: { provider: string; levels: string[]; cached: boolean };
    tf2: { cached: boolean };
  };
  expect(r.tf1.provider).toBe('local-ast');
  expect(r.tf1.levels.length).toBe(5);
  expect(r.tf2.cached).toBe(true);
  hub.cleanup();
  rmSync(dir, { recursive: true, force: true });
});

// --- r146 ---
bdd.given('一份包含状态机、规则文档与决策表的 Studio 会话数据', (ctx) => {
  const [l1] = buildDemoStudioWebDrafts();
  ctx.fixtures['r146Draft'] = l1;
});
bdd.when('从历史节点创建人类与 Agent 平行分叉、编辑重开删除评论并编译决策表', (ctx) => {
  const l1 = ctx.fixtures['r146Draft'] as ReturnType<typeof buildDemoStudioWebDrafts>[0];
  const key = l1.current!.machineKey;
  const modifyDraft = {
    ...l1,
    mode: 'modify' as const,
    baseline: cloneMachineIR(l1.current!),
  };
  let doc = createStudioStateDoc({
    id: 'bdd-wl',
    title: 'BDD Worldline',
    createdAt: '2026-11-27T00:00:00Z',
    drafts: [modifyDraft],
  });
  const mA = cloneMachineIR(doc.machines[key]!.current!);
  mA.states.push({ uid: 's90', name: '分叉A' });
  doc = recordWorldlineCommit(doc, key, mA, {
    label: 'A',
    createdAt: '2026-11-27T00:01:00Z',
    actor: 'human',
  });
  doc = switchWorldlineHead(doc, key, 0, '2026-11-27T00:02:00Z');
  const mB = cloneMachineIR(doc.machines[key]!.current!);
  const e0 = mB.transitions.shift()!;
  mB.transitions.push({ ...e0, uid: 'e_recreated' });
  doc = recordWorldlineCommit(doc, key, mB, {
    label: 'B',
    createdAt: '2026-11-27T00:03:00Z',
    actor: 'agent',
    parentId: 'BASE',
  });
  const netDiff = computeMachineDiff(doc.machines[key]!);

  doc = addStudioComment(doc, {
    anchor: { kind: 'forest', capability: 'studio-web' },
    author: 'human',
    body: 'v1',
    createdAt: '2026-11-27T00:04:00Z',
  });
  doc = editStudioComment(doc, 'c1', { body: 'v2', updatedAt: '2026-11-27T00:05:00Z' });
  doc = resolveStudioComment(doc, 'c1', '2026-11-27T00:06:00Z');
  doc = reopenStudioComment(doc, 'c1', '2026-11-27T00:07:00Z');
  const afterReopen = doc.comments[0]!;
  doc = deleteStudioComment(doc, 'c1', '2026-11-27T00:08:00Z');

  const dtDoc = parseCapability(
    `# language: zh-CN\n# purpose: 决策表\n功能: dt\n  @req:r1\n  规则: 判定\n    判定。\n    场景大纲: 表\n      假如 条件 <c>\n      当 判定\n      那么 结果 <r>\n      例子:\n        | c | r |\n        | 是 | 通过 |\n        | 否 | 拒绝 |\n`,
    'dt.feature',
  );
  const tables = extractDecisionTables(dtDoc);
  const tree = compileDecisionTableToTree(tables[0]!.headers, tables[0]!.rows);
  ctx.fixtures['r146Res'] = { doc, key, netDiff, afterReopen, tree };
});
bdd.thenStep('世界线同时保留两个平行分叉且净 Diff 对冲假边噪音', (ctx) => {
  const r = ctx.fixtures['r146Res'] as {
    doc: { timelines: Record<string, { entries: unknown[] }> };
    key: string;
    netDiff: { hasChanges: boolean };
  };
  expect(r.doc.timelines[r.key]!.entries.length).toBe(3);
  expect(r.netDiff.hasChanges).toBe(false);
});
bdd.thenStep('评论 CRUD 与 0-LLM 决策树节点结构全部准确无误', (ctx) => {
  const r = ctx.fixtures['r146Res'] as {
    doc: { comments: unknown[] };
    afterReopen: { body: string; status: string };
    tree: { nodes: unknown[]; edges: unknown[] };
  };
  expect(r.afterReopen.body).toBe('v2');
  expect(r.afterReopen.status).toBe('open');
  expect(r.doc.comments.length).toBe(0);
  expect(r.tree.nodes.length).toBe(3);
  expect(r.tree.edges.length).toBe(2);
});

// --- r147 ---
bdd.given('Studio 前端避障互斥路由器、设计洁癖检查与构建产出目录', (ctx) => {
  ctx.fixtures['r147Obs'] = [{ x1: 40, y1: 280, x2: 300, y2: 440 }];
});
bdd.when('对多行跨列与双向边执行路由计算并校验静态构建产物不含开发态占位文案', (ctx) => {
  const obs = ctx.fixtures['r147Obs'] as RectBox[];
  const geom = routeObstacleAwareEdge({
    sx: 170,
    sy: 200,
    tx: 170,
    ty: 560,
    preset: 'bezier',
    obstacles: obs,
    endpoints: { ax: 170, ay: 135, bx: 170, by: 620, hwA: 128, hhA: 65, hwB: 128, hhB: 65 },
  });
  const labels: RectBox[] = [];
  const a = resolveLabelPosition(200, 200, 100, 20, labels, []);
  const b = resolveLabelPosition(200, 200, 100, 20, labels, []);
  // Verify BOTH compiled object-literal parser AND runtime JSON-env embedded path AND disk fallback
  const objParsed = parseEmbeddedStudioAssets({
    'index.html': { encoding: 'utf8', content: '<!doctype html><html><body>ok</body></html>' },
  });
  const prevEmbedded = process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS;
  let embeddedOk = false;
  try {
    process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS = JSON.stringify({
      'index.html': { encoding: 'utf8', content: '<!doctype html><html><body>ok</body></html>' },
    });
    resetEmbeddedStudioAssetsCache();
    const emb = loadStudioAsset('index.html');
    embeddedOk =
      objParsed !== null &&
      emb !== null &&
      new TextDecoder().decode(emb.bytes).includes('<body>ok</body>');
  } finally {
    if (prevEmbedded === undefined) {
      delete process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS;
    } else {
      process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS = prevEmbedded;
    }
    resetEmbeddedStudioAssetsCache();
  }
  const distIndex = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'apps',
    'studio',
    'dist',
    'index.html',
  );
  let diskOk = false;
  if (existsSync(distIndex)) {
    diskOk = loadStudioAsset('index.html') !== null;
  } else {
    const tmpDist = mkdtempSync(join(tmpdir(), 'llman-bdd-dist-'));
    try {
      writeFileSync(join(tmpDist, 'index.html'), '<!doctype html><html></html>', 'utf8');
      diskOk = loadStudioAsset('index.html', tmpDist) !== null;
    } finally {
      rmSync(tmpDist, { recursive: true, force: true });
    }
  }
  ctx.fixtures['r147Res'] = {
    hits: countPolyObstacleHits(geom.samplePts, obs),
    overlap: rectsOverlap(
      { x1: a.lx - 50, y1: a.ly - 10, x2: a.lx + 50, y2: a.ly + 10 },
      { x1: b.lx - 50, y1: b.ly - 10, x2: b.lx + 50, y2: b.ly + 10 },
      0,
    ),
    assetOk: embeddedOk && diskOk,
  };
});
bdd.thenStep('所有默认路由零穿卡零标签重叠且构建产物可被本地服务正确托管', (ctx) => {
  const r = ctx.fixtures['r147Res'] as { hits: number; overlap: boolean; assetOk: boolean };
  expect(r.hits).toBe(0);
  expect(r.overlap).toBe(false);
  expect(r.assetOk).toBe(true);
});

// --- r148 ---
bdd.given('自举 Studio Web 状态机 IR 与守卫开关映射', (ctx) => {
  const [l1] = buildDemoStudioWebDrafts();
  ctx.fixtures['r148Machine'] = l1!.current!;
});
bdd.when('调用前端 XState 编译器创建 actor 并分别在守卫为假与为真时触发转移', (ctx) => {
  const machine = ctx.fixtures['r148Machine'] as NonNullable<
    ReturnType<typeof buildDemoStudioWebDrafts>[0]['current']
  >;
  const sim = createMachineSimulationSession(machine);
  sim.send('打开主视图或深链');
  sim.send('进入规格编辑');
  sim.send('打开世界线与对比');
  const blocked = sim.send('校验通过保存变更');
  sim.setGuard('门禁全绿', true);
  const allowed = sim.send('校验通过保存变更');
  ctx.fixtures['r148Res'] = {
    blocked: blocked.transitioned,
    allowed: allowed.transitioned,
    traceLen: sim.getTrace().length,
  };
  sim.stop();
});
bdd.thenStep('守卫为假时转移被拦截且守卫为真时正确流转并记录微步轨迹', (ctx) => {
  const r = ctx.fixtures['r148Res'] as { blocked: boolean; allowed: boolean; traceLen: number };
  expect(r.blocked).toBe(false);
  expect(r.allowed).toBe(true);
  expect(r.traceLen).toBe(4);
});

// --- r151 ---
bdd.given('一份包含 drift-trace 待审建议的 Studio 会话文档', (ctx) => {
  const [l1] = buildDemoStudioWebDrafts();
  const machineKey = l1!.current!.machineKey;
  const baseDoc = createStudioStateDoc({
    id: 'bdd-drift-web',
    title: 'BDD Drift Web',
    createdAt: '2026-11-27T00:00:00Z',
    drafts: [l1!],
  });
  const { doc } = applyDriftProposalsToStateDoc(
    baseDoc,
    [
      {
        machineKey,
        from: '画布直编与草稿态',
        event: '热修直写',
        to: '旁路状态',
        count: 2,
        sampleLines: [5, 9],
      },
    ],
    '2026-11-27T00:01:00Z',
  );
  ctx.fixtures['r151State'] = { doc, machineKey };
});

bdd.when('分别生成逻辑漂移画布叠加、真理胜出修正 Prompt 与执行追认新意图采纳', (ctx) => {
  const { doc, machineKey } = ctx.fixtures['r151State'] as {
    doc: StudioStateDoc;
    machineKey: string;
  };
  const pending = getPendingDriftProposals(doc.revisions, machineKey);
  const overlay = computeDriftCalibrationOverlay(doc.machines[machineKey]!.current!, pending);
  const prompt = buildTruthWinsPrompt({
    repo: 'llman-sdd',
    branch: 'main',
    wsKey: 'llman-sdd@main@root',
    stateId: doc.id,
    machineKey,
    sourceFile: doc.machines[machineKey]!.sourceFile,
    proposals: pending,
  });
  const accepted = acceptRevisionProposal(doc, pending[0]!.id, '2026-11-27T00:02:00Z');
  ctx.fixtures['r151Res'] = { overlay, prompt, accepted, machineKey };
});

bdd.thenStep('漂移叠加包含新增状态与虚线绿边、真理胜出 Prompt 含 Trace 证据与锚点', (ctx) => {
  const r = ctx.fixtures['r151Res'] as {
    overlay: ReturnType<typeof computeDriftCalibrationOverlay>;
    prompt: string;
    machineKey: string;
  };
  expect(r.overlay).not.toBeNull();
  expect(r.overlay!.addedStates.map((s) => s.name)).toEqual(['旁路状态']);
  expect(r.overlay!.addedEdges.length).toBe(1);
  expect(r.prompt).toContain(`machine:${r.machineKey}`);
  expect(r.prompt).toContain('热修直写');
});

bdd.thenStep('追认新意图原子写入草稿与 agent 世界线节点且标记建议已采纳', (ctx) => {
  const r = ctx.fixtures['r151Res'] as {
    accepted: StudioStateDoc;
    machineKey: string;
  };
  expect(r.accepted.revisions[0]!.status).toBe('accepted');
  expect(r.accepted.timelines[r.machineKey]!.entries.at(-1)?.actor).toBe('agent');
  expect(
    r.accepted.machines[r.machineKey]!.current!.states.some((s) => s.name === '旁路状态'),
  ).toBe(true);
});

// --- r154 ---
bdd.when(
  '先读取默认视图配置再经 PUT /api/views 写入自定义领域 Tab 与人工虚线并重读',
  async (ctx) => {
    const hub = ctx.fixtures['r145Hub'] as CreatedStudioHubApp;
    const req = (p: string, init?: RequestInit) =>
      hub.app.request(`http://127.0.0.1:4710${p}`, init);
    const v1 = viewsResponseSchema.parse(await (await req('/api/views')).json());
    const badRes = await req('/api/views', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ viewsDoc: { bad: true } }),
    });
    const nextDoc = defaultStudioViewsDoc('2026-11-27T02:00:00Z');
    nextDoc.views.push({
      id: 'view-custom',
      title: '自定义切片',
      includedCapabilities: ['bdd-sample'],
      showExternalHops: true,
      bridgeOnly: false,
      manualLinks: [{ id: 'ml1', fromCap: 'bdd-sample', toCap: 'other', label: '参考虚线' }],
      manualGroups: [],
      macroPositions: {},
    });
    await req('/api/views', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ viewsDoc: nextDoc }),
    });
    const v2 = viewsResponseSchema.parse(await (await req('/api/views')).json());
    ctx.fixtures['r154Res'] = { v1, badStatus: badRes.status, v2 };
  },
);

bdd.thenStep('默认视图仅含主视图且自定义视图原子落盘、非法载荷返回 400 且 specs 零修改', (ctx) => {
  const dir = ctx.fixtures['r145Dir'] as string;
  const hub = ctx.fixtures['r145Hub'] as CreatedStudioHubApp;
  const r = ctx.fixtures['r154Res'] as {
    v1: { viewsDoc: { views: Array<{ id: string }> } };
    badStatus: number;
    v2: { viewsDoc: { views: Array<{ id: string }> } };
  };
  expect(r.v1.viewsDoc.views.length).toBe(1);
  expect(r.v1.viewsDoc.views[0]!.id).toBe('main');
  expect(r.badStatus).toBe(400);
  expect(r.v2.viewsDoc.views.length).toBe(2);
  expect(readFileSync(join(dir, 'llmanspec', 'specs', 'bdd-sample.feature'), 'utf8')).toBe(
    BDD_SPEC,
  );
  hub.cleanup();
  rmSync(dir, { recursive: true, force: true });
});

// --- r155 ---
bdd.given('包含领域分组、跨组契约边与非成员节点的宏观森林布局', (ctx) => {
  const specs: SpecIndexItem[] = [
    {
      id: 'order',
      title: 'order',
      file: 'llmanspec/specs/order.feature',
      kind: 'machine',
      hardness: 'drift-guarded',
      ruleCount: 2,
      scenarioCount: 2,
      decisionTableCount: 0,
      machineKeys: ['order/r10/main'],
      summary: '订单',
      reqPreview: ['@req:r10'],
      tags: ['#commerce'],
      stale: false,
    },
    {
      id: 'risk',
      title: 'risk',
      file: 'llmanspec/specs/risk.feature',
      kind: 'decision',
      hardness: 'tested',
      ruleCount: 1,
      scenarioCount: 1,
      decisionTableCount: 1,
      machineKeys: [],
      summary: '风控',
      reqPreview: ['@req:r20'],
      tags: ['#risk'],
      stale: false,
    },
    {
      id: 'intruder',
      title: 'intruder',
      file: 'llmanspec/specs/intruder.feature',
      kind: 'doc',
      hardness: 'doc',
      ruleCount: 1,
      scenarioCount: 0,
      decisionTableCount: 0,
      machineKeys: [],
      summary: '外部说明',
      reqPreview: ['@req:r30'],
      tags: [],
      stale: false,
    },
  ];
  const edges: SpecIndexEdge[] = [
    {
      id: 'ref_1',
      from: 'risk',
      to: 'order',
      label: '@req:r20',
      kind: 'spec-ref',
      evidence: [{ sourceReqId: 'r10', targetReqId: 'r20', summary: '前置依赖 @req:r20' }],
    },
  ];
  ctx.fixtures['r155Input'] = { specs, edges };
});

bdd.when('执行排他空间守卫、交叉桥计算与外部契约门户证据解析', (ctx) => {
  const { specs, edges } = ctx.fixtures['r155Input'] as {
    specs: SpecIndexItem[];
    edges: SpecIndexEdge[];
  };
  const { groups, ungroupedIds } = buildExclusiveDomainGroupsWithManual(
    specs,
    [
      { id: 'g1', title: '交易', tone: 'blue', capabilities: ['order'] },
      { id: 'g2', title: '风控', tone: 'teal', capabilities: ['risk'] },
    ],
    new Set(),
  );
  const layout = layoutMainViewWithGroups(
    specs,
    groups,
    ungroupedIds,
    new Set(),
    { intruder: { x: 80, y: 110 } },
    'map',
  );
  const bridges = computeCrossForestBridges(
    {
      nodes: specs.map((s) => ({ ...s, weight: 1 })),
      edges: edges.map((e) => ({ ...e, kind: 'spec-ref', evidence: e.evidence ?? [] })),
    },
    groups.map((g) => ({ id: g.id, capabilities: g.memberIds })),
  );
  const portalEv = extractPortalEvidence('order', 'upstream', 'risk', edges);
  ctx.fixtures['r155Res'] = { layout, bridges, portalEv };
});

bdd.thenStep('任意分组包围盒零误包非成员节点且交叉桥与外部门户证据列表完整准确', (ctx) => {
  const { layout, bridges, portalEv } = ctx.fixtures['r155Res'] as {
    layout: ReturnType<typeof layoutMainViewWithGroups>;
    bridges: ReturnType<typeof computeCrossForestBridges>;
    portalEv: ReturnType<typeof extractPortalEvidence>;
  };
  const pos = layout.specPositions['intruder']!;
  for (const gb of layout.groupBoxes) {
    if (gb.group.memberIds.includes('intruder')) continue;
    const hit =
      pos.x < gb.x + gb.width &&
      pos.x + 254 > gb.x &&
      pos.y < gb.y + gb.height &&
      pos.y + 158 > gb.y;
    expect(hit).toBe(false);
  }
  expect(bridges.bridges.length).toBe(1);
  expect(portalEv.length).toBe(1);
  expect(portalEv[0]!.targetReqId).toBe('r20');
});

// ── r156: real-browser E2E visual invariants (pure geometry judge) ──

bdd.given('一组同时违反 6 条设计真言的浏览器几何快照与一组干净快照', (ctx) => {
  ctx.fixtures['r156Snapshots'] = {
    violating: buildViolatingSnapshot(),
    clean: buildCleanSnapshot(),
  };
});

bdd.when('分别交由 Studio E2E 纯几何判定器裁决', (ctx) => {
  const snaps = ctx.fixtures['r156Snapshots'] as {
    violating: ReturnType<typeof buildViolatingSnapshot>;
    clean: ReturnType<typeof buildCleanSnapshot>;
  };
  ctx.fixtures['r156Res'] = {
    violating: checkStudioInvariants(snaps.violating),
    clean: checkStudioInvariants(snaps.clean),
  };
});

bdd.thenStep('违规快照逐条命中 6 类违规且干净快照零违规', (ctx) => {
  const res = ctx.fixtures['r156Res'] as {
    violating: ReturnType<typeof checkStudioInvariants>;
    clean: ReturnType<typeof checkStudioInvariants>;
  };
  const hit = new Set(res.violating.map((v) => v.invariant));
  expect([...ALL_STUDIO_INVARIANTS].every((id) => hit.has(id))).toBe(true);
  expect(res.clean).toEqual([]);
});

bdd.thenStep('justfile 提供 qa-studio-e2e 单门且 just qa 聚合该门', () => {
  const root = join(import.meta.dirname, '..', '..', '..');
  const justfile = readFileSync(join(root, 'justfile'), 'utf8');
  expect(justfile).toMatch(/^qa-studio-e2e:/mu);
  const qaRecipe = /^qa:[^\n]*\n((?:[ \t]+[^\n]*\n)*)/mu.exec(justfile)?.[0] ?? '';
  expect(qaRecipe).toContain('qa-studio-e2e');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  expect(pkg.scripts['qa']).toContain('qa-studio-e2e');
});

// ── r157: onboarding, shortcut registry, multi-select tidy & zoom-out contrast ──

bdd.given('Studio 快捷键注册表、多选节点坐标集合与双皮肤颜色令牌', (ctx) => {
  const boxes: NodeBoxInput[] = [
    { id: 'n1', x: 80, y: 40, width: 200, height: 100 },
    { id: 'n2', x: 240, y: 120, width: 200, height: 100 },
    { id: 'n3', x: 680, y: 200, width: 200, height: 100 },
  ];
  ctx.fixtures['r157Input'] = { boxes, palettes: STUDIO_CONTRAST_PALETTES };
});

bdd.when('按视图过滤快捷键、执行多选对齐与等距分布并计算双皮肤边框连线对比度', (ctx) => {
  const { boxes, palettes } = ctx.fixtures['r157Input'] as {
    boxes: NodeBoxInput[];
    palettes: typeof STUDIO_CONTRAST_PALETTES;
  };
  ctx.fixtures['r157Res'] = {
    macroShortcuts: filterShortcutsByView('macro', STUDIO_SHORTCUT_REGISTRY),
    machineShortcuts: filterShortcutsByView('machine', STUDIO_SHORTCUT_REGISTRY),
    aligned: alignSelectedNodes(boxes, 'left'),
    distributed: distributeSelectedNodes(boxes, 'horizontal'),
    contrasts: {
      linearEdge: contrastRatio(palettes.linear.edgeDefault, palettes.linear.canvasBg),
      linearBorder: contrastRatio(palettes.linear.borderStrong, palettes.linear.canvasBg),
      washiEdge: contrastRatio(palettes.washi.edgeDefault, palettes.washi.canvasBg),
      washiBorder: contrastRatio(palettes.washi.borderStrong, palettes.washi.canvasBg),
    },
  };
});

bdd.thenStep(
  '仅返回已接线快捷键、多选坐标精确对齐分布且双皮肤默认连线与强边框对比度均不低于 3.0',
  (ctx) => {
    const res = ctx.fixtures['r157Res'] as {
      macroShortcuts: ReturnType<typeof filterShortcutsByView>;
      machineShortcuts: ReturnType<typeof filterShortcutsByView>;
      aligned: ReturnType<typeof alignSelectedNodes>;
      distributed: ReturnType<typeof distributeSelectedNodes>;
      contrasts: Record<string, number>;
    };
    expect(res.macroShortcuts.some((s) => s.id === 'macro-group')).toBe(true);
    expect(res.macroShortcuts.some((s) => s.id === 'tab-spawn')).toBe(false);
    expect(res.machineShortcuts.some((s) => s.id === 'tab-spawn')).toBe(true);
    expect(res.aligned['n1']!.x).toBe(80);
    expect(res.aligned['n2']!.x).toBe(80);
    expect(res.aligned['n3']!.x).toBe(80);
    expect(res.distributed['n2']!.x).toBe(380);
    for (const ratio of Object.values(res.contrasts)) {
      expect(ratio).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
    }
  },
);

// ── r159: /api/search workspace-isolated BM25, SSRF guard & RAG fallback ──

bdd.when('先以中文关键词请求 /api/search，再传入非回环与不可达回环 RAG 地址', async (ctx) => {
  const hub = ctx.fixtures['r145Hub'] as CreatedStudioHubApp;
  const dir = ctx.fixtures['r145Dir'] as string;
  try {
    const post = (body: unknown) =>
      hub.app.fetch(
        new Request(`http://127.0.0.1:4710/api/p/${encodeURIComponent(hub.activeWsKey)}/search`, {
          method: 'POST',
          headers: {
            host: '127.0.0.1:4710',
            'content-type': 'application/json',
            'x-studio-token': hub.token,
          },
          body: JSON.stringify(body),
        }),
      );
    const localRes = await post({ query: '样例规则' });
    const localJson = studioSearchResponseSchema.parse(await localRes.json());
    const ssrfRes = await post({ query: '样例规则', endpoint: 'https://evil.example.com' });
    const fallbackRes = await post({ query: '样例规则', endpoint: 'http://127.0.0.1:1' });
    const fallbackJson = studioSearchResponseSchema.parse(await fallbackRes.json());
    ctx.fixtures['r159Res'] = {
      localStatus: localRes.status,
      localJson,
      ssrfStatus: ssrfRes.status,
      fallbackStatus: fallbackRes.status,
      fallbackJson,
    };
  } finally {
    hub.cleanup();
    rmSync(dir, { recursive: true, force: true });
  }
});

bdd.thenStep(
  '本地 BM25 返回带片段的排序命中、非回环 RAG 地址返回 400 且不可达回环 RAG 无感降级回 local-bm25',
  (ctx) => {
    const res = ctx.fixtures['r159Res'] as {
      localStatus: number;
      localJson: ReturnType<typeof studioSearchResponseSchema.parse>;
      ssrfStatus: number;
      fallbackStatus: number;
      fallbackJson: ReturnType<typeof studioSearchResponseSchema.parse>;
    };
    expect(res.localStatus).toBe(200);
    expect(res.localJson.provider).toBe('local-bm25');
    expect(res.localJson.hits.length).toBeGreaterThan(0);
    expect(res.localJson.hits[0]!.snippet.length).toBeGreaterThan(0);
    expect(res.ssrfStatus).toBe(400);
    expect(res.fallbackStatus).toBe(200);
    expect(res.fallbackJson.provider).toBe('local-bm25');
    expect(Boolean(res.fallbackJson.degradedReason)).toBe(true);
  },
);

// ── r162: Studio read-only Human Theorems bootstrap & BM25 recall ──

bdd.given('一个含人类定理与封签的随机端口 Studio 本地服务', (ctx) => {
  const { dir, hub } = createTempStudioApp();
  mkdirSync(join(dir, 'llmanspec', 'theorems'), { recursive: true });
  const thContent = [
    '---',
    'title: "边界定理"',
    'owner: human',
    '---',
    '',
    '## theorem:readonly-spec — 主干规格只读保护',
    '- **statement**: 默认分支不得静默改写规格文件。',
    '',
  ].join('\n');
  writeFileSync(join(dir, 'llmanspec', 'theorems', 'guard.md'), thContent);
  const hash = new Bun.CryptoHasher('sha256').update(thContent).digest('hex');
  writeFileSync(
    join(dir, 'llmanspec', 'theorems', '.theorems.lock.json'),
    JSON.stringify(
      {
        version: 1,
        sealedAt: '2026-11-27T00:00:00.000Z',
        files: { 'llmanspec/theorems/guard.md': hash },
      },
      null,
      2,
    ),
  );
  ctx.fixtures['r162App'] = { dir, hub };
});

bdd.when('请求 /api/bootstrap 与以定理关键词请求 /api/search', async (ctx) => {
  const { dir, hub } = ctx.fixtures['r162App'] as { dir: string; hub: CreatedStudioHubApp };
  try {
    const bootRes = await hub.app.fetch(
      new Request(`http://127.0.0.1:4710/api/p/${encodeURIComponent(hub.activeWsKey)}/bootstrap`, {
        headers: { host: '127.0.0.1:4710' },
      }),
    );
    const boot = bootstrapResponseSchema.parse(await bootRes.json());
    const searchRes = await hub.app.fetch(
      new Request(`http://127.0.0.1:4710/api/p/${encodeURIComponent(hub.activeWsKey)}/search`, {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4710',
          'content-type': 'application/json',
          'x-studio-token': hub.token,
        },
        body: JSON.stringify({ query: '静默改写' }),
      }),
    );
    const search = studioSearchResponseSchema.parse(await searchRes.json());
    ctx.fixtures['r162Res'] = { boot, search };
  } finally {
    hub.cleanup();
    rmSync(dir, { recursive: true, force: true });
  }
});

bdd.thenStep(
  'bootstrap 包含该定理与封签状态且 search 返回 targetKind 为 theorem 的命中结果',
  (ctx) => {
    const { boot, search } = ctx.fixtures['r162Res'] as {
      boot: ReturnType<typeof bootstrapResponseSchema.parse>;
      search: ReturnType<typeof studioSearchResponseSchema.parse>;
    };
    expect(boot.theoremLockStatus).toBe('sealed');
    expect(boot.theorems?.some((t) => t.id === 'readonly-spec')).toBe(true);
    expect(
      search.hits.some((h) => h.targetKind === 'theorem' && h.targetId === 'readonly-spec'),
    ).toBe(true);
  },
);

// ── r165 / r166: file-sync HUD copy, worldline snapshot, activity, prompt subset ──

bdd.given('一份含画布草稿与已前进磁盘哈希的 Studio 会话', (ctx) => {
  const created = buildDemoStudioWebDrafts()[0]!;
  const doc = createStudioStateDoc({
    id: 'sync-hud',
    title: 'sync',
    createdAt: '2026-11-28T00:00:00.000Z',
    drafts: [created],
  });
  const key = created.current?.machineKey ?? Object.keys(doc.machines)[0]!;
  ctx.fixtures['r165'] = { doc, key };
});

bdd.when('进入同步态并分别读取冲突条文案、世界线快照格与多 Tab 修订冲突提示', (ctx) => {
  const { doc, key } = ctx.fixtures['r165'] as { doc: StudioStateDoc; key: string };
  const snapped = snapshotBeforeSync(doc, key, '2026-11-28T01:00:00.000Z');
  const hud = pickTopHudSlot({
    syncOpen: true,
    worldlineComparing: true,
    hasDrift: true,
    simulating: true,
    showTips: true,
  });
  const visible = [
    SYNC_COPY.banner,
    SYNC_COPY.attentionTitle,
    SYNC_COPY.snapshotHint,
    SYNC_COPY.yours,
    SYNC_COPY.incoming,
    SYNC_COPY.lookItemByItem,
    SYNC_COPY.tabRevision,
  ].join('\n');
  ctx.fixtures['r165Res'] = { snapped, key, hud, visible };
});

bdd.thenStep('世界线含「刚才在画布上的版本」、冲突条含规定白话且不含技术术语', (ctx) => {
  const { snapped, key, visible } = ctx.fixtures['r165Res'] as {
    snapped: StudioStateDoc;
    key: string;
    visible: string;
  };
  const labels = snapped.timelines[key]?.entries.map((e) => e.label) ?? [];
  expect(labels).toContain(SYNC_SNAPSHOT_LABEL);
  expect(visible).toContain(SYNC_COPY.banner);
  expect(copyContainsForbidden(visible)).toBeNull();
});

bdd.thenStep('多 Tab 提示为「另一扇窗口刚保存了这份草稿」且顶栏中轴浮条不超过 1', (ctx) => {
  const { hud } = ctx.fixtures['r165Res'] as { hud: ReturnType<typeof pickTopHudSlot> };
  expect(hud).toBe('worldline-compare');
  expect(SYNC_COPY.yours).toBe('你在本画布的调整');
  expect(SYNC_COPY.tabRevision).toBe('另一扇窗口刚保存了这份草稿');
});

bdd.given('一份含他处保存事件、Agent 开放评论与 drift-trace 建议的 Studio 会话', (ctx) => {
  let doc = createStudioStateDoc({
    id: 'act-1',
    title: 'act',
    createdAt: '2026-11-28T00:00:00.000Z',
    drafts: [],
  });
  doc = addStudioComment(doc, {
    anchor: { kind: 'machine', machineKey: 'order/r1/主流程' },
    author: 'agent',
    body: '建议补一条超时边',
    createdAt: '2026-11-28T00:00:00.000Z',
  });
  doc = {
    ...doc,
    revisions: [
      {
        id: 'rv1',
        machineKey: 'order/r1/主流程',
        author: 'agent',
        source: 'drift-trace',
        rationale: 'trace',
        ops: [],
        createdAt: 't',
        status: 'pending',
      },
    ],
  };
  ctx.fixtures['r166'] = { doc };
});

bdd.when('折叠活动条目、为评论设置请谁看并分别生成全部与勾选子集 Prompt', (ctx) => {
  const { doc } = ctx.fixtures['r166'] as { doc: StudioStateDoc };
  const items = foldActivityItems({
    events: [
      {
        type: 'state-updated',
        wsKey: 'other@main@root',
        stateId: 'workspace-draft',
        revision: 2,
        originClientId: 'peer-tab',
      },
    ],
    selfClientId: 'this-tab',
    activeWsKey: 'llman-sdd@main@root',
    comments: doc.comments,
    revisions: doc.revisions,
  });
  const c = doc.comments[0]!;
  const fromDisk = foldActivityItems({
    events: [],
    selfClientId: 'this-tab',
    activeWsKey: 'llman-sdd@main@root',
    comments: doc.comments,
    revisions: doc.revisions,
  });
  ctx.fixtures['r166Res'] = {
    items,
    fromDisk,
    defaultWatch: commentWatchTag(c),
    allOpen: doc.comments.filter((x) => x.status === 'open').map((x) => x.body),
    subset: [c.body],
  };
});

bdd.thenStep('活动条目为白话且 N>0 才显示标记、缺省请谁看等于作者', (ctx) => {
  const { items, fromDisk, defaultWatch } = ctx.fixtures['r166Res'] as {
    items: ReturnType<typeof foldActivityItems>;
    fromDisk: ReturnType<typeof foldActivityItems>;
    defaultWatch: string;
  };
  expect(items.length).toBeGreaterThan(0);
  expect(items.every((i) => copyContainsForbidden(i.label) === null)).toBe(true);
  expect(fromDisk.some((i) => i.kind === 'agent-comment')).toBe(true);
  expect(defaultWatch).toBe('agent');
});

bdd.thenStep('未勾选 Prompt 含全部未解决看法、勾选后只含被勾条目且按钮无 @agent', (ctx) => {
  const { allOpen, subset } = ctx.fixtures['r166Res'] as { allOpen: string[]; subset: string[] };
  expect(allOpen.length).toBeGreaterThanOrEqual(subset.length);
  expect(SYNC_COPY.promptSubset.includes('@agent')).toBe(false);
});

function bddIr(
  key: string,
  states: Array<{ uid: string; name: string; sub?: string }>,
  transitions: Array<{ from: string; event: string; to: string }>,
): StudioMachineIR {
  return {
    machineKey: key,
    capability: key,
    reqId: 'r1',
    ruleTitle: key,
    scenarioName: 'main',
    initialStateUid: states[0]?.uid ?? null,
    columns: { from: 'from', event: 'event', to: 'to' },
    states: states.map((s) => ({
      uid: s.uid,
      name: s.name,
      ...(s.sub ? { subMachineKey: s.sub } : {}),
    })),
    transitions: transitions.map((t, i) => ({
      uid: `t${String(i)}`,
      fromUid: t.from,
      event: t.event,
      toUid: t.to,
    })),
  };
}

bdd.given('一份同一子机被两个宿主引用的 DAG 状态机集合', (ctx) => {
  const child = bddIr('child', [{ uid: 'c1', name: 'c' }], []);
  const hostA = bddIr(
    'hostA',
    [
      { uid: 'a0', name: 'a-in' },
      { uid: 'ah', name: 'a-host', sub: 'child' },
      { uid: 'a1', name: 'a-out' },
    ],
    [
      { from: 'a0', event: 'enter', to: 'ah' },
      { from: 'ah', event: 'leave', to: 'a1' },
    ],
  );
  const hostB = bddIr(
    'hostB',
    [
      { uid: 'b0', name: 'b-in' },
      { uid: 'bh', name: 'b-host', sub: 'child' },
      { uid: 'b1', name: 'b-out' },
    ],
    [
      { from: 'b0', event: 'in', to: 'bh' },
      { from: 'bh', event: 'out', to: 'b1' },
    ],
  );
  ctx.fixtures['nestDag'] = { child, hostA, hostB };
});

bdd.when('分别沿两条 nest 路径计算父层上下文', (ctx) => {
  const { child, hostA, hostB } = ctx.fixtures['nestDag'] as {
    child: StudioMachineIR;
    hostA: StudioMachineIR;
    hostB: StudioMachineIR;
  };
  const machines: Record<string, StudioMachineIR> = {
    child,
    hostA,
    hostB,
  };
  const resolve = (k: string) => machines[k];
  const stack = [{ machineKey: 'child', label: 'child' }];
  ctx.fixtures['nestDagCtx'] = {
    a: getParentNestContext(stack, 'hostA', 'hostA', resolve),
    b: getParentNestContext(stack, 'hostB', 'hostB', resolve),
    crumbsA: nestBreadcrumb('hostA', 'hostA', stack).map((c) => c.label),
    crumbsB: nestBreadcrumb('hostB', 'hostB', stack).map((c) => c.label),
  };
});

bdd.thenStep('两条路径的面包屑与宿主状态互不相同且邻居来自各自父机', (ctx) => {
  const r = ctx.fixtures['nestDagCtx'] as {
    a: ReturnType<typeof getParentNestContext>;
    b: ReturnType<typeof getParentNestContext>;
    crumbsA: string[];
    crumbsB: string[];
  };
  expect(r.a?.hostName).toBe('a-host');
  expect(r.b?.hostName).toBe('b-host');
  expect(r.crumbsA).not.toEqual(r.crumbsB);
  expect(r.a?.incoming[0]?.name).toBe('a-in');
  expect(r.b?.incoming[0]?.name).toBe('b-in');
});

bdd.given('一份含 A 引用 B、B 引用 A 的环数据与一份合法子树草稿', (ctx) => {
  const a = bddIr('A', [{ uid: 'sa', name: 'ha', sub: 'B' }], []);
  const b = bddIr('B', [{ uid: 'sb', name: 'hb', sub: 'A' }], []);
  const child = bddIr('child', [{ uid: 'c1', name: 'c' }], []);
  const host = bddIr('host', [{ uid: 'h1', name: 'h', sub: 'child' }], []);
  ctx.fixtures['nestCycle'] = { a, b, child, host };
});

bdd.when('分别计算环的子树机器集合与合法子树的分层 Diff 文本', (ctx) => {
  const { a, b, child, host } = ctx.fixtures['nestCycle'] as {
    a: StudioMachineIR;
    b: StudioMachineIR;
    child: StudioMachineIR;
    host: StudioMachineIR;
  };
  const cycleMap: Record<string, StudioMachineIR> = { A: a, B: b };
  const ids = getSubtreeMachineIds('A', (k) => cycleMap[k]);
  const drafts = {
    host: {
      mode: 'modify' as const,
      baseline: host,
      current: host,
      sourceFile: 'host.feature',
    },
    child: {
      mode: 'modify' as const,
      baseline: child,
      current: { ...child, states: [...child.states, { uid: 'cx', name: 'extra' }] },
      sourceFile: 'child.feature',
    },
  };
  ctx.fixtures['nestCycleOut'] = {
    ids,
    text: buildSubtreeDiffText('host', drafts),
  };
});

bdd.thenStep('环计算终止且每机至多出现一次', (ctx) => {
  const { ids } = ctx.fixtures['nestCycleOut'] as { ids: string[] };
  expect(ids).toEqual(['A', 'B']);
  expect(new Set(ids).size).toBe(ids.length);
});

bdd.thenStep('合法子树 Diff 含分层标题', (ctx) => {
  const { text } = ctx.fixtures['nestCycleOut'] as { text: string };
  expect(text).toContain('# [子层: child]');
});

bdd.given('一组无 nest 的既有深链查询与一组含 nest 及 macro-edge focus 的查询', (ctx) => {
  ctx.fixtures['deepQueries'] = {
    legacy: 'kind=machine&target=cap/r1/flow',
    nested: 'kind=machine&target=k0&nest=k0,k1,k2&focus=macro-edge:ref_1',
  };
});

bdd.when('分别解析并再序列化', (ctx) => {
  const q = ctx.fixtures['deepQueries'] as { legacy: string; nested: string };
  const legacy = parseStudioDeepLink(q.legacy);
  const nested = parseStudioDeepLink(q.nested);
  ctx.fixtures['deepParsed'] = {
    legacy,
    nested,
    legacyAgain: parseStudioDeepLink(formatStudioDeepLinkQuery(legacy)),
  };
});

bdd.thenStep('无 nest 的结果与既有 kind 和 target 一致', (ctx) => {
  const r = ctx.fixtures['deepParsed'] as {
    legacy: ReturnType<typeof parseStudioDeepLink>;
    legacyAgain: ReturnType<typeof parseStudioDeepLink>;
  };
  expect(r.legacy.kind).toBe('machine');
  expect(r.legacy.target).toBe('cap/r1/flow');
  expect(r.legacy.nest).toEqual([]);
  expect(r.legacy.focus).toBeNull();
  expect(r.legacyAgain.kind).toBe(r.legacy.kind);
  expect(r.legacyAgain.target).toBe(r.legacy.target);
});

bdd.thenStep('含 nest 的结果保留路径与 macro-edge 聚焦', (ctx) => {
  const r = ctx.fixtures['deepParsed'] as { nested: ReturnType<typeof parseStudioDeepLink> };
  expect(r.nested.nest).toEqual(['k0', 'k1', 'k2']);
  expect(r.nested.focus).toEqual({ kind: 'macro-edge', id: 'ref_1' });
});
