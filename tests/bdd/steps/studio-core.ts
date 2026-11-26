// BDD acceptance steps for llmanspec/specs/studio-core.feature (r128-r133).
import {
  STUDIO_STATES_REL,
  acceptRevisionProposal,
  buildDemoReimbursementDraft,
  buildDemoStudioDrafts,
  buildProposalDraft,
  cloneMachineIR,
  computeMachineDiff,
  createMachineDraft,
  createStudioStateDoc,
  extractStudioMachines,
  formatSemanticDiff,
  hasBlockingDiagnostics,
  parseCapability,
  previewFeatureUnifiedDiff,
  previewRevisionProposal,
  proposeRevision,
  readStudioState,
  recordTimelineCommit,
  renderUpdatedFeatureSource,
  rollbackTimeline,
  validateCapability,
  validateMachineGraph,
  writeStudioState,
  type MachineDiagnostic,
  type MachineDraft,
  type MachineSemanticDiff,
  type SpecEntry,
  type StudioMachineIR,
  type StudioStateDoc,
  type StudioStateIo,
} from '@llman-sdd/core';

import { bdd } from '../runner.ts';

// --- r128 ---
bdd.given('一个含中英文状态流转表的 spec 条目集合', (ctx) => {
  const zhSrc = `# language: zh-CN
# purpose: 中文状态机示例
功能: zh-order

  @req:r1
  规则: 中文订单流转
    系统 MUST 校验流转。

    场景大纲: 订单主流程
      假如 当前处于 <初始状态>
      当 触发 <事件>
      那么 进入 <目标状态>
      例子:
        | 初始状态 | 事件 | 目标状态 |
        | 待支付 | 支付 | 已支付 |
`;
  const enSrc = `# language: en
# purpose: English transition table sample
Feature: en-job

  @req:r2
  Rule: Job transition
    System MUST validate transitions.

    Scenario Outline: job flow
      Given state is <from>
      When <event>
      Then state is <to>
      Examples:
        | from | event | to |
        | queued | start | done |
`;
  const entries: SpecEntry[] = [
    {
      fileName: 'llmanspec/specs/zh-order.feature',
      specId: 'zh-order',
      doc: parseCapability(zhSrc, 'llmanspec/specs/zh-order.feature'),
    },
    {
      fileName: 'llmanspec/specs/en-job.feature',
      specId: 'en-job',
      doc: parseCapability(enSrc, 'llmanspec/specs/en-job.feature'),
    },
  ];
  ctx.fixtures['r128Entries'] = entries;
});

bdd.when('调用 Studio 纯域提取状态机并创建从零新建草稿', (ctx) => {
  const entries = ctx.fixtures['r128Entries'] as SpecEntry[];
  const extracted = extractStudioMachines(entries);
  const created = createMachineDraft({
    capability: 'refund',
    ruleTitle: '退款流转',
    scenarioName: '退款流程',
    states: [{ name: '申请中', initial: true }, { name: '已退款' }],
    transitions: [{ from: '申请中', event: '批准', to: '已退款' }],
  });
  ctx.fixtures['r128Result'] = { extracted, created };
});

bdd.thenStep('提取结果保留原列族与稳定 uid 且新建草稿基线为空', (ctx) => {
  const { extracted, created } = ctx.fixtures['r128Result'] as {
    extracted: ReturnType<typeof extractStudioMachines>;
    created: MachineDraft;
  };
  if (extracted.length !== 2)
    throw new Error(`expected 2 machines, got ${String(extracted.length)}`);
  if (extracted[0]?.machine.columns.from !== '初始状态') {
    throw new Error('zh column family not preserved');
  }
  if (extracted[1]?.machine.columns.from !== 'from') {
    throw new Error('en column family not preserved');
  }
  if (extracted[0]?.machine.states[0]?.uid !== 's1') throw new Error('missing stable state uid');
  if (created.mode !== 'create' || created.baseline !== null) {
    throw new Error('create draft must have mode=create and baseline=null');
  }
});

// --- r129 ---
bdd.given('一张同时包含重复冲突边、孤岛状态与占位命名的状态机图', (ctx) => {
  const machine: StudioMachineIR = {
    machineKey: 'lint/r1/full',
    capability: 'lint',
    reqId: 'r1',
    ruleTitle: 'Linter full scan',
    scenarioName: 'full',
    initialStateUid: 's1',
    columns: { from: '初始状态', event: '事件', to: '目标状态' },
    states: [
      { uid: 's1', name: '草稿' },
      { uid: 's2', name: '已通过' },
      { uid: 's3', name: '新状态3' },
    ],
    transitions: [
      { uid: 'e1', fromUid: 's1', event: '提交', toUid: 's2' },
      { uid: 'e2', fromUid: 's1', event: '提交', toUid: 's2' },
    ],
  };
  ctx.fixtures['r129Machine'] = machine;
});

bdd.when('运行 validateMachineGraph 全量校验', (ctx) => {
  const machine = ctx.fixtures['r129Machine'] as StudioMachineIR;
  ctx.fixtures['r129Diags'] = validateMachineGraph(machine);
});

bdd.thenStep('同时返回 E2 冲突、E3 孤岛与 W2 警告且各自附带精确图元 uid', (ctx) => {
  const diags = ctx.fixtures['r129Diags'] as MachineDiagnostic[];
  const hasE2 = diags.some((d) => d.code === 'E2' && d.targetId === 'e2');
  const hasE3 = diags.some((d) => d.code === 'E3' && d.targetId === 's3');
  const hasW2 = diags.some(
    (d) => d.code === 'W2' && d.severity === 'warning' && d.targetId === 's3',
  );
  if (!hasE2 || !hasE3 || !hasW2) {
    throw new Error(`missing expected diagnostics: ${JSON.stringify(diags)}`);
  }
});

// --- r130 ---
bdd.given('一份基于基线重命名状态并修改守卫的草稿', (ctx) => {
  const demo = buildDemoReimbursementDraft();
  const base = cloneMachineIR(demo.current!);
  const current = cloneMachineIR(demo.current!);
  current.states[1]!.name = '主管审批';
  current.transitions[1]!.guard = '金额<=3000';
  const draft: MachineDraft = {
    mode: 'modify',
    baseline: base,
    current,
    sourceFile: demo.sourceFile,
  };
  ctx.fixtures['r130Draft'] = draft;
});

bdd.when('计算语义 Diff 与格式化摘要', (ctx) => {
  const draft = ctx.fixtures['r130Draft'] as MachineDraft;
  const diff = computeMachineDiff(draft);
  const summary = formatSemanticDiff(diff, draft);
  ctx.fixtures['r130Result'] = { diff, summary };
});

bdd.thenStep('仅报告状态改名与守卫修改且无多余边删增', (ctx) => {
  const { diff, summary } = ctx.fixtures['r130Result'] as {
    diff: MachineSemanticDiff;
    summary: string;
  };
  if (diff.statesRenamed.length !== 1 || diff.statesRenamed[0]?.to !== '主管审批') {
    throw new Error(`expected state rename, got ${JSON.stringify(diff.statesRenamed)}`);
  }
  if (diff.transitionsAdded.length !== 0 || diff.transitionsRemoved.length !== 0) {
    throw new Error('state rename triggered false transition churn');
  }
  if (
    diff.transitionsModified.length !== 1 ||
    !diff.transitionsModified[0]?.changedFields.includes('guard')
  ) {
    throw new Error('expected guard modification');
  }
  if (!summary.includes('~ rename state: 待审批 -> 主管审批')) {
    throw new Error(`unexpected summary:\n${summary}`);
  }
});

// --- r131 ---
bdd.given('一份含待审 Agent 修订建议的草稿会话', (ctx) => {
  const demo = buildDemoReimbursementDraft();
  const draft: MachineDraft = {
    ...demo,
    mode: 'modify',
    baseline: cloneMachineIR(demo.current!),
  };
  const key = draft.current!.machineKey;
  const baseDoc = createStudioStateDoc({
    id: 'bdd-rev',
    title: 'BDD Revision Session',
    createdAt: '2026-11-26T12:00:00Z',
    drafts: [draft],
  });
  const docWithProposal = proposeRevision(baseDoc, {
    machineKey: key,
    rationale: '将待审批重命名为财务审核并补充特批转移',
    createdAt: '2026-11-26T12:01:00Z',
    ops: [
      { op: 'rename_state', from: '待审批', to: '财务审核' },
      { op: 'add_transition', from: '财务审核', event: '特批', guard: 'CFO授权', to: '已通过' },
    ],
  });
  ctx.fixtures['r131State'] = {
    key,
    beforeDraftJson: JSON.stringify(baseDoc.machines[key]),
    docWithProposal,
  };
});

bdd.when('先预演再显式采纳该修订建议', (ctx) => {
  const { key, docWithProposal } = ctx.fixtures['r131State'] as {
    key: string;
    beforeDraftJson: string;
    docWithProposal: StudioStateDoc;
  };
  const rev = docWithProposal.revisions[0]!;
  const preview = previewRevisionProposal(docWithProposal.machines[key]!, rev);
  const afterPreviewJson = JSON.stringify(docWithProposal.machines[key]);
  const accepted = acceptRevisionProposal(docWithProposal, rev.id, '2026-11-26T12:02:00Z');
  ctx.fixtures['r131Result'] = { preview, afterPreviewJson, accepted };
});

bdd.thenStep('采纳前人类草稿零改动且采纳后状态改名与新转移原子生效', (ctx) => {
  const { key, beforeDraftJson } = ctx.fixtures['r131State'] as {
    key: string;
    beforeDraftJson: string;
  };
  const { afterPreviewJson, accepted } = ctx.fixtures['r131Result'] as {
    afterPreviewJson: string;
    accepted: StudioStateDoc;
  };
  if (afterPreviewJson !== beforeDraftJson) {
    throw new Error('human draft was mutated before acceptance');
  }
  const cur = accepted.machines[key]?.current;
  if (!cur?.states.some((s) => s.uid === 's2' && s.name === '财务审核')) {
    throw new Error('rename_state was not applied atomically');
  }
  if (!cur.transitions.some((t) => t.event === '特批' && t.guard === 'CFO授权')) {
    throw new Error('add_transition was not applied atomically');
  }
});

// --- r132 ---
bdd.given('一个内存态 StudioStateIo 端口夹具', (ctx) => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const renames: Array<{ from: string; to: string }> = [];
  const io: StudioStateIo = {
    exists: (p) => files.has(p) || dirs.has(p),
    readText: (p) => {
      const s = files.get(p);
      if (s === undefined) throw new Error(`missing ${p}`);
      return s;
    },
    writeText: (p, content) => {
      files.set(p, content);
    },
    rename: (from, to) => {
      const s = files.get(from);
      if (s === undefined) throw new Error(`missing rename src ${from}`);
      files.delete(from);
      files.set(to, s);
      renames.push({ from, to });
    },
    listDir: () => [],
    mkdirp: (d) => {
      dirs.add(d);
    },
    remove: (p) => {
      files.delete(p);
    },
    currentPid: () => 1001,
    now: () => new Date('2026-11-26T12:00:00Z'),
  };
  ctx.fixtures['r132Mem'] = { io, renames };
});

bdd.when('写入草稿、追加时间线快照并回滚至基准同时校验内置样例', (ctx) => {
  const { io } = ctx.fixtures['r132Mem'] as {
    io: StudioStateIo;
    renames: Array<{ from: string; to: string }>;
  };
  const demos = buildDemoStudioDrafts();
  const demoBlocking = demos.some((d) => hasBlockingDiagnostics(validateMachineGraph(d.current!)));

  const first = demos[0]!;
  const modifyDraft: MachineDraft = {
    ...first,
    mode: 'modify',
    baseline: cloneMachineIR(first.current!),
  };
  const key = modifyDraft.current!.machineKey;
  let doc = createStudioStateDoc({
    id: 'bdd-store',
    title: 'BDD Store Session',
    createdAt: '2026-11-26T12:00:00Z',
    drafts: [modifyDraft],
  });
  const mutated = cloneMachineIR(doc.machines[key]!.current!);
  mutated.states[0]!.name = '临时名';
  doc = recordTimelineCommit(doc, key, mutated, {
    label: 'rename',
    createdAt: '2026-11-26T12:01:00Z',
  });
  doc = rollbackTimeline(doc, key, 0, '2026-11-26T12:02:00Z');
  const savedPath = writeStudioState(io, doc);
  const reloaded = readStudioState(io, 'bdd-store');
  ctx.fixtures['r132Result'] = { key, savedPath, reloaded, demoBlocking };
});

bdd.thenStep('草稿经临时文件原子替换落盘、回滚恢复基准且内置样例零错误', (ctx) => {
  const { renames } = ctx.fixtures['r132Mem'] as {
    renames: Array<{ from: string; to: string }>;
  };
  const { key, savedPath, reloaded, demoBlocking } = ctx.fixtures['r132Result'] as {
    key: string;
    savedPath: string;
    reloaded: StudioStateDoc;
    demoBlocking: boolean;
  };
  if (savedPath !== `${STUDIO_STATES_REL}/bdd-store.json`) {
    throw new Error(`unexpected state path: ${savedPath}`);
  }
  if (renames.length !== 1 || !renames[0]?.from.includes('.tmp.')) {
    throw new Error('state file was not written via atomic tmp + rename');
  }
  if (computeMachineDiff(reloaded.machines[key]!).hasChanges) {
    throw new Error('rollback to BASE did not restore baseline');
  }
  if (demoBlocking) throw new Error('built-in demo failed validateMachineGraph');
});

// --- r133 ---
bdd.given('一份在状态机场景上方插入额外规则的 .feature 源码与修改草稿', (ctx) => {
  const original = `# language: zh-CN
# purpose: 报销规范
功能: expense

  @req:r10
  规则: 报销流转
    系统 MUST 校验流转。

    # 核心注释不可丢失
    场景大纲: 报销主流程
      假如 当前处于 <初始状态> 且满足 <守卫>
      当 触发 <事件>
      那么 进入 <目标状态>
      例子:
        | 初始状态 | 事件 | 守卫 | 目标状态 |
        | 草稿 | 提交 |  | 待审批 |
        | 待审批 | 批准 | 金额<=5000 | 已通过 |
`;
  const drifted = `# language: zh-CN
# purpose: 报销规范
功能: expense

  @req:r9
  规则: 审计记录
    系统 MUST 记录审计。

    场景: 记录日志
      假如 发起提交
      当 落盘
      那么 存在日志

  @req:r10
  规则: 报销流转
    系统 MUST 校验流转。

    # 核心注释不可丢失
    场景大纲: 报销主流程
      假如 当前处于 <初始状态> 且满足 <守卫>
      当 触发 <事件>
      那么 进入 <目标状态>
      例子:
        | 初始状态 | 事件 | 守卫 | 目标状态 |
        | 草稿 | 提交 |  | 待审批 |
        | 待审批 | 批准 | 金额<=5000 | 已通过 |
`;
  const entry: SpecEntry = {
    fileName: 'llmanspec/specs/expense.feature',
    specId: 'expense',
    doc: parseCapability(original, 'llmanspec/specs/expense.feature'),
  };
  const draft = extractStudioMachines([entry])[0]!.draft;
  draft.current!.states[1]!.name = '主管审批';
  ctx.fixtures['r133Input'] = { drifted, draft };
});

bdd.when('渲染更新源码、生成 Unified Diff 预览并组装提案草案', (ctx) => {
  const { drifted, draft } = ctx.fixtures['r133Input'] as {
    drifted: string;
    draft: MachineDraft;
  };
  const rendered = renderUpdatedFeatureSource(drifted, draft);
  const diffPatch = previewFeatureUnifiedDiff('llmanspec/specs/expense.feature', drifted, rendered);
  const proposal = buildProposalDraft({
    title: '报销状态机更新',
    why: '细化主管审批状态。',
    drafts: [draft],
  });
  ctx.fixtures['r133Result'] = { rendered, diffPatch, proposal };
});

bdd.thenStep(
  '目标例子表精准替换且注释完好、写回源码通过 parseCapability 与 validateCapability',
  (ctx) => {
    const { rendered, diffPatch, proposal } = ctx.fixtures['r133Result'] as {
      rendered: string;
      diffPatch: string;
      proposal: string;
    };
    if (!rendered.includes('# 核心注释不可丢失') || !rendered.includes('主管审批')) {
      throw new Error('lossless render failed to preserve comment or apply state rename');
    }
    if (!diffPatch.includes('+++ b/llmanspec/specs/expense.feature')) {
      throw new Error('Unified Diff preview missing file header');
    }
    if (!proposal.includes('title: 报销状态机更新')) {
      throw new Error('proposal draft missing frontmatter title');
    }
    const reparsed = parseCapability(rendered, 'llmanspec/specs/expense.feature');
    const verdict = validateCapability(
      { fileName: 'llmanspec/specs/expense.feature', specId: 'expense', doc: reparsed },
      () => false,
    );
    if (!verdict.ok) {
      throw new Error(
        `rendered feature failed validateCapability: ${JSON.stringify(verdict.items)}`,
      );
    }
  },
);
