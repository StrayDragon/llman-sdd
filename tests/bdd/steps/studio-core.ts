// BDD acceptance steps for llmanspec/specs/studio-core.feature (r128-r133).
import {
  STUDIO_STATES_REL,
  STUDIO_VIEWS_REL,
  acceptRevisionProposal,
  applyDriftProposalsToStateDoc,
  buildDemoReimbursementDraft,
  buildDemoStudioDrafts,
  buildDriftSlicePacket,
  buildForestGraph,
  buildProposalDraft,
  buildWorkspaceSearchDocuments,
  cloneMachineIR,
  computeCrossForestBridges,
  computeMachineDiff,
  createMachineDraft,
  createStudioStateDoc,
  defaultStudioViewsDoc,
  extractStudioMachines,
  formatSemanticDiff,
  hasBlockingDiagnostics,
  parseCapability,
  parseRuntimeTraceJsonl,
  parseUnifiedDiffHunks,
  previewFeatureUnifiedDiff,
  previewRevisionProposal,
  proposeRevision,
  readStudioState,
  readStudioViews,
  reconcileRuntimeTrace,
  recordTimelineCommit,
  renderUpdatedFeatureSource,
  rollbackTimeline,
  searchWorkspaceBm25,
  validateCapability,
  validateForestIsolation,
  validateMachineGraph,
  applySyncPicks,
  buildSyncItems,
  validateFlowAndNesting,
  writeStudioState,
  writeStudioViews,
  type MachineDiagnostic,
  type MachineDraft,
  type MachineSemanticDiff,
  type SpecEntry,
  type StudioMachineIR,
  type StudioStateDoc,
  type StudioStateIo,
  type StudioViewsIo,
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

// --- r149 ---
bdd.given(
  '一份状态机规范、含未登记后门转移与损坏行的 JSONL Trace 及带 @llmanspec: 注释的多语言代码改动',
  (ctx) => {
    const specSrc = `# language: zh-CN
# purpose: 订单审批状态流转规范

功能: order

  @req:r12
  规则: 订单审批流转
    订单从待审批流转至已通过或已驳回。

    @transitions
    场景大纲: 审批主流程
      假如 当前状态为 <from>
      当 触发 <event>
      那么 进入 <to>

      例子:
        | from   | event | to     |
        | 待审批 | 批准  | 已通过 |
        | 待审批 | 驳回  | 已驳回 |
`;
    const entry: SpecEntry = {
      fileName: 'llmanspec/specs/order.feature',
      specId: 'order',
      doc: parseCapability(specSrc, 'llmanspec/specs/order.feature'),
    };
    const traceText = [
      '{"machine":"order","from":"待审批","event":"批准","to":"已通过"}',
      '{bad-json',
      '{"machine":"order","from":"待审批","event":"超额转审","to":"财务复核"}',
    ].join('\n');
    const diffText = [
      'diff --git a/src/order.py b/src/order.py',
      '--- a/src/order.py',
      '+++ b/src/order.py',
      '@@ -1,3 +1,4 @@',
      ' # @llmanspec:r12',
      ' def approve(amount):',
      '+    if amount > 5000: return "财务复核"',
      '     return "已通过"',
    ].join('\n');
    ctx.fixtures['r149Input'] = {
      entries: [entry],
      traceText,
      diffText,
      pyContent:
        '# @llmanspec:r12\ndef approve(amount):\n    if amount > 5000: return "财务复核"\n    return "已通过"\n',
    };
  },
);

bdd.when('调用纯域解析对账、生成反向建议层与构建最小切片裁决包', (ctx) => {
  const { entries, traceText, diffText, pyContent } = ctx.fixtures['r149Input'] as {
    entries: SpecEntry[];
    traceText: string;
    diffText: string;
    pyContent: string;
  };
  const extracted = extractStudioMachines(entries);
  const parsed = parseRuntimeTraceJsonl(traceText);
  const rec = reconcileRuntimeTrace(
    extracted.map((e) => e.machine),
    parsed.events,
  );
  const baseDoc = createStudioStateDoc({
    id: 'bdd-drift',
    title: 'BDD Drift',
    createdAt: '2026-11-27T00:00:00Z',
    drafts: extracted.map((e) => e.draft),
  });
  const applied = applyDriftProposalsToStateDoc(
    baseDoc,
    rec.shadowTransitions,
    '2026-11-27T00:01:00Z',
  );
  const hunks = parseUnifiedDiffHunks(diffText);
  const slice = buildDriftSlicePacket({
    sinceRef: 'HEAD~1',
    specEntries: entries,
    diffFiles: [{ file: 'src/order.py', content: pyContent, hunks: hunks[0]!.hunks }],
  });
  ctx.fixtures['r149Result'] = { parsed, rec, applied, slice };
});

bdd.thenStep(
  '损坏行精确报出行号、后门转移与未覆盖边准确检出且反向建议带 drift-trace 标记',
  (ctx) => {
    const { parsed, rec, applied } = ctx.fixtures['r149Result'] as {
      parsed: ReturnType<typeof parseRuntimeTraceJsonl>;
      rec: ReturnType<typeof reconcileRuntimeTrace>;
      applied: ReturnType<typeof applyDriftProposalsToStateDoc>;
    };
    if (parsed.errors.length !== 1 || parsed.errors[0]?.line !== 2) {
      throw new Error(`expected parse error at line 2, got ${JSON.stringify(parsed.errors)}`);
    }
    if (rec.shadowTransitions.length !== 1 || rec.uncoveredTransitions.length !== 1) {
      throw new Error(`unexpected reconcile counts: ${JSON.stringify(rec)}`);
    }
    if (
      applied.addedProposalIds.length !== 1 ||
      applied.doc.revisions[0]?.source !== 'drift-trace' ||
      applied.doc.revisions[0]?.status !== 'pending'
    ) {
      throw new Error(`unexpected drift proposal: ${JSON.stringify(applied.doc.revisions)}`);
    }
  },
);

bdd.thenStep('最小切片仅包含命中 @llmanspec: 锚点的 hunk 与对应规则原文', (ctx) => {
  const { slice } = ctx.fixtures['r149Result'] as {
    slice: ReturnType<typeof buildDriftSlicePacket>;
  };
  if (
    slice.matchedFiles.length !== 1 ||
    slice.impactedSpecs.length !== 1 ||
    slice.impactedSpecs[0]?.reqId !== 'r12'
  ) {
    throw new Error(`unexpected drift slice packet: ${JSON.stringify(slice)}`);
  }
});

// --- r153 ---
bdd.given(
  '包含状态机、决策表、规则文档与孤立规格的 spec 集合及内存态 StudioViewsIo 夹具',
  (ctx) => {
    const entries: SpecEntry[] = [
      {
        specId: 'order',
        fileName: 'llmanspec/specs/order.feature',
        doc: parseCapability(
          `# language: zh-CN\n# purpose: 订单状态机\n功能: order\n  @req:r10\n  规则: 订单\n    前置依赖 @req:r20。\n    @transitions\n    场景大纲: 流程\n      假如 <from>\n      当 <event>\n      那么 <to>\n      例子:\n        | from | event | to |\n        | 待支付 | 支付 | 已支付 |\n`,
          'llmanspec/specs/order.feature',
        ),
      },
      {
        specId: 'risk',
        fileName: 'llmanspec/specs/risk.feature',
        doc: parseCapability(
          `# language: zh-CN\n# purpose: 风控决策表\n功能: risk\n  @req:r20\n  规则: 风控\n    判定。\n    场景大纲: 表\n      假如 <c>\n      当 判\n      那么 <r>\n      例子:\n        | c | r |\n        | 高 | 通过 |\n        | 低 | 拦截 |\n`,
          'llmanspec/specs/risk.feature',
        ),
      },
      {
        specId: 'orphan',
        fileName: 'llmanspec/specs/orphan.feature',
        doc: parseCapability(
          `# language: zh-CN\n# purpose: 孤立规则\n功能: orphan\n  @req:r30\n  规则: 孤立\n    无跨能力引用。\n`,
          'llmanspec/specs/orphan.feature',
        ),
      },
    ];
    const files = new Map<string, string>();
    const renames: Array<{ from: string; to: string }> = [];
    const io: StudioViewsIo = {
      exists: (p) => files.has(p),
      readText: (p) => files.get(p) ?? '',
      writeText: (p, t) => {
        files.set(p, t);
      },
      rename: (from, to) => {
        files.set(to, files.get(from) ?? '');
        files.delete(from);
        renames.push({ from, to });
      },
      mkdirp: () => {},
      currentPid: () => 2026,
      now: () => new Date('2026-11-27T00:00:00Z'),
    };
    ctx.fixtures['r153Input'] = { entries, io, renames };
  },
);

bdd.when(
  '运行 buildForestGraph、computeCrossForestBridges、validateForestIsolation 与原子写入 views.json',
  (ctx) => {
    const { entries, io } = ctx.fixtures['r153Input'] as {
      entries: SpecEntry[];
      io: StudioViewsIo;
    };
    const graph = buildForestGraph(entries);
    const bridges = computeCrossForestBridges(graph, [
      { id: 'g1', capabilities: ['order'] },
      { id: 'g2', capabilities: ['risk'] },
    ]);
    const diags = validateForestIsolation(graph);
    const doc = defaultStudioViewsDoc('2026-11-27T00:00:00Z');
    const savedRel = writeStudioViews(io, doc);
    const reloaded = readStudioViews(io);
    ctx.fixtures['r153Result'] = { graph, bridges, diags, savedRel, reloaded };
  },
);

bdd.thenStep('节点分类权重与自动实线 evidence 准确提取且交叉桥仅命中跨组契约边', (ctx) => {
  const { graph, bridges } = ctx.fixtures['r153Result'] as {
    graph: ReturnType<typeof buildForestGraph>;
    bridges: ReturnType<typeof computeCrossForestBridges>;
  };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (byId.get('order')?.kind !== 'machine' || byId.get('risk')?.kind !== 'decision') {
    throw new Error(`unexpected node kinds: ${JSON.stringify(graph.nodes)}`);
  }
  if (graph.edges.length !== 1 || graph.edges[0]?.evidence[0]?.targetReqId !== 'r20') {
    throw new Error(`missing evidence on forest edge: ${JSON.stringify(graph.edges)}`);
  }
  if (bridges.bridges.length !== 1 || bridges.bridges[0]?.from !== 'risk') {
    throw new Error(`unexpected bridges: ${JSON.stringify(bridges)}`);
  }
});

bdd.thenStep('孤立规格产出 W3 警告且 views.json 经临时文件原子替换校验通过', (ctx) => {
  const { renames } = ctx.fixtures['r153Input'] as { renames: Array<{ from: string; to: string }> };
  const { diags, savedRel, reloaded } = ctx.fixtures['r153Result'] as {
    diags: ReturnType<typeof validateForestIsolation>;
    savedRel: string;
    reloaded: ReturnType<typeof readStudioViews>;
  };
  if (diags.length !== 1 || diags[0]?.code !== 'W3' || diags[0]?.capability !== 'orphan') {
    throw new Error(`expected W3 on orphan, got ${JSON.stringify(diags)}`);
  }
  if (
    savedRel !== STUDIO_VIEWS_REL ||
    renames.length !== 1 ||
    !renames[0]?.from.includes('.views.tmp.') ||
    reloaded.views.length !== 1
  ) {
    throw new Error('views.json atomic write/read verification failed');
  }
});

// ── r158: Studio pure CJK-bigram + BM25 workspace full-text search ──

bdd.given('包含中文规则正文、转移守卫与业务评论的 Studio 工作区文档集', (ctx) => {
  const src = `# language: zh-CN
# purpose: 支付幂等锁与超时退回规格

功能: payment-lock

  @req:r401
  规则: 幂等锁超时退回
    当下游 30 秒无响应时 MUST 释放幂等锁并触发超时退回。

    @transitions
    场景大纲: 支付流转
      假如 处于 <from>
      当 触发 <event>
      那么 进入 <to>

      例子:
        | from   | event    | guard    | to     |
        | 锁定中 | 超时退回 | 超过30秒 | 已退回 |
`;
  const doc = parseCapability(src, 'payment-lock.feature');
  let stateDoc = createStudioStateDoc({
    id: 'bdd-search',
    title: 'BDD Search',
    drafts: [],
    createdAt: '2026-11-27T00:00:00.000Z',
  });
  stateDoc = {
    ...stateDoc,
    comments: [
      {
        id: 'c_1',
        anchor: { kind: 'doc', capability: 'payment-lock' },
        author: 'human',
        body: '讨论分布式幂等锁续租机制',
        status: 'open',
        createdAt: '2026-11-27T00:00:00.000Z',
      },
    ],
  };
  ctx.fixtures['r158Docs'] = buildWorkspaceSearchDocuments(
    [{ capId: 'payment-lock', doc }],
    stateDoc,
  );
});

bdd.when('分别以中文短语与英文标识符执行 searchWorkspaceBm25', (ctx) => {
  const docs = ctx.fixtures['r158Docs'] as ReturnType<typeof buildWorkspaceSearchDocuments>;
  ctx.fixtures['r158Res'] = {
    cnHits: searchWorkspaceBm25(docs, '幂等锁'),
    enHits: searchWorkspaceBm25(docs, '@req:r401'),
  };
});

bdd.thenStep('命中条目按相关性降序返回且携带对应目标锚点与非空命中片段摘要', (ctx) => {
  const { cnHits, enHits } = ctx.fixtures['r158Res'] as {
    cnHits: ReturnType<typeof searchWorkspaceBm25>;
    enHits: ReturnType<typeof searchWorkspaceBm25>;
  };
  if (cnHits.length < 2 || !cnHits.some((h) => h.targetKind === 'comment')) {
    throw new Error(`expected cnHits including comment, got ${JSON.stringify(cnHits)}`);
  }
  for (let i = 1; i < cnHits.length; i += 1) {
    if (cnHits[i - 1]!.score < cnHits[i]!.score) {
      throw new Error('BM25 hits not sorted descending by score');
    }
  }
  if (enHits.length === 0 || enHits[0]?.targetId !== 'r401' || enHits[0]!.snippet.length === 0) {
    throw new Error(`unexpected enHits: ${JSON.stringify(enHits)}`);
  }
});

// ── r164: three-way semantic sync items ──

bdd.given('一份公共基线状态机、一份画布草稿与一份磁盘重解析状态机', (ctx) => {
  const created = createMachineDraft({
    capability: 'order',
    reqId: 'r1',
    ruleTitle: '订单',
    scenarioName: '主流程',
    states: [{ name: '草稿', initial: true }, { name: '待审' }, { name: '完成' }],
    transitions: [
      { from: '草稿', event: '提交', to: '待审' },
      { from: '待审', event: '通过', to: '完成' },
    ],
  });
  const baseline = cloneMachineIR(created.current!);
  const ours = cloneMachineIR(baseline);
  ours.states.push({ uid: 's99', name: '已取消' });
  ours.transitions.push({
    uid: 'e99',
    fromUid: ours.states[1]!.uid,
    event: '驳回',
    toUid: ours.states[0]!.uid,
  });
  const theirs = cloneMachineIR(baseline);
  theirs.states.push({ uid: 's88', name: '已归档' });
  theirs.transitions.push({
    uid: 'e88',
    fromUid: theirs.states[1]!.uid,
    event: '加急',
    toUid: theirs.states[2]!.uid,
  });
  const clashOurs = cloneMachineIR(baseline);
  clashOurs.transitions[1] = { ...clashOurs.transitions[1]!, guard: '金额<=1000' };
  const clashTheirs = cloneMachineIR(baseline);
  clashTheirs.transitions[1] = { ...clashTheirs.transitions[1]!, guard: '金额<=9000' };
  ctx.fixtures['r164'] = {
    draft: {
      mode: 'modify' as const,
      baseline,
      current: ours,
      sourceFile: 'llmanspec/specs/order.feature',
    },
    theirs,
    clashDraft: {
      mode: 'modify' as const,
      baseline,
      current: clashOurs,
      sourceFile: 'llmanspec/specs/order.feature',
    },
    clashTheirs,
  };
});

bdd.when('构建三方条目并对 ours、theirs、both 与同签名 both 分别执行 applySyncPicks', (ctx) => {
  const { draft, theirs, clashDraft, clashTheirs } = ctx.fixtures['r164'] as {
    draft: MachineDraft;
    theirs: StudioMachineIR;
    clashDraft: MachineDraft;
    clashTheirs: StudioMachineIR;
  };
  const items = buildSyncItems(draft, theirs);
  const oursItem = items.find(
    (i) => i.oursStateName === '已取消' || i.oursTransition?.event === '驳回',
  );
  const theirsItem = items.find(
    (i) => i.theirsStateName === '已归档' || i.theirsTransition?.event === '加急',
  );
  const clashItems = buildSyncItems(clashDraft, clashTheirs);
  const clash = clashItems.find((i) => i.oursPresent && i.theirsPresent);
  ctx.fixtures['r164Res'] = {
    items,
    keepOurs: applySyncPicks(
      draft,
      items,
      Object.fromEntries(items.map((i) => [i.id, 'ours'])),
      '2026-11-28T00:00:00.000Z',
    ),
    takeTheirs: applySyncPicks(
      draft,
      items,
      Object.fromEntries(items.map((i) => [i.id, 'theirs'])),
      '2026-11-28T00:00:00.000Z',
    ),
    both: applySyncPicks(
      draft,
      items,
      {
        ...(oursItem ? { [oursItem.id]: 'ours' } : {}),
        ...(theirsItem ? { [theirsItem.id]: 'theirs' } : {}),
      },
      '2026-11-28T00:00:00.000Z',
    ),
    clashBlocked: clash
      ? applySyncPicks(clashDraft, clashItems, { [clash.id]: 'both' }, '2026-11-28T00:00:00.000Z')
      : { blocked: [] },
  };
});

bdd.thenStep('仅一侧条目带默认勾选、同签名一致条目不进待勾选', (ctx) => {
  const { items } = ctx.fixtures['r164Res'] as { items: ReturnType<typeof buildSyncItems> };
  if (
    !items.some((i) => i.defaultPick === 'ours') ||
    !items.some((i) => i.defaultPick === 'theirs')
  ) {
    throw new Error(`expected ours/theirs defaults: ${JSON.stringify(items)}`);
  }
});

bdd.thenStep(
  'ours 保留画布、theirs 并入文件侧、合法 both 两条都留、同签名 both 返回 blocked',
  (ctx) => {
    const res = ctx.fixtures['r164Res'] as {
      keepOurs: ReturnType<typeof applySyncPicks>;
      takeTheirs: ReturnType<typeof applySyncPicks>;
      both: ReturnType<typeof applySyncPicks>;
      clashBlocked: { blocked: Array<{ reason: string }> };
    };
    const oursNames = res.keepOurs.draft.current!.states.map((s) => s.name);
    if (!oursNames.includes('已取消') || oursNames.includes('已归档')) {
      throw new Error('ours pick did not keep canvas-only state');
    }
    const theirsNames = res.takeTheirs.draft.current!.states.map((s) => s.name);
    if (!theirsNames.includes('已归档') || theirsNames.includes('已取消')) {
      throw new Error('theirs pick did not merge disk-only state');
    }
    const bothNames = res.both.draft.current!.states.map((s) => s.name);
    if (!bothNames.includes('已取消') || !bothNames.includes('已归档')) {
      throw new Error('legal both did not keep both states');
    }
    if (res.clashBlocked.blocked.length === 0) {
      throw new Error('expected blocked both on signature clash');
    }
  },
);

const FLOW_HOST = `# language: zh-CN
# purpose: host
功能: host

  @req:r10
  规则: 宿主
    宿主 MUST 嵌套。

    @flow
    @transitions
    场景大纲: 主流程
      假如 当前处于 <from>
      当 触发 <event>
      那么 流转至 <to>
      例子:
        | from | event | to |
        | 待审 | go | 完成 |
        | 完成 | back | 待审 |

    @states
    场景大纲: 状态属性
      假如 状态 <状态>
      当 读取属性
      那么 子机为 <子机>
      例子:
        | 状态 | 子机 | 网关 |
        | 待审 | @req:r20 | 是 |
`;

const FLOW_CHILD = `# language: zh-CN
# purpose: child
功能: child

  @req:r20
  规则: 子机
    子机 MUST 流转。

    @transitions
    场景大纲: 审批流
      假如 当前处于 <from>
      当 触发 <event>
      那么 流转至 <to>
      例子:
        | from | event | to |
        | 草稿 | go | 通过 |
        | 通过 | back | 草稿 |
`;

bdd.given('一份含 @flow 与 @states 且跨能力引用子机的规格集合', (ctx) => {
  ctx.fixtures['r168Extract'] = {
    host: FLOW_HOST,
    child: FLOW_CHILD,
    entries: [
      {
        fileName: 'llmanspec/specs/host.feature',
        specId: 'host',
        doc: parseCapability(FLOW_HOST, 'llmanspec/specs/host.feature'),
      },
      {
        fileName: 'llmanspec/specs/child.feature',
        specId: 'child',
        doc: parseCapability(FLOW_CHILD, 'llmanspec/specs/child.feature'),
      },
    ] satisfies SpecEntry[],
  };
});

bdd.when('抽取状态机并无改动写回，再改名与增删嵌套后写回再抽取', (ctx) => {
  const { host, child, entries } = ctx.fixtures['r168Extract'] as {
    host: string;
    child: string;
    entries: SpecEntry[];
  };
  const extracted = extractStudioMachines(entries);
  const hostDraft = extracted.find((e) => e.machine.capability === 'host')!.draft;
  const unchanged = renderUpdatedFeatureSource(host, hostDraft);
  const cur = cloneMachineIR(hostDraft.current!);
  const pending = cur.states.find((s) => s.name === '待审')!;
  pending.name = '审核中';
  const done = cur.states.find((s) => s.name === '完成')!;
  done.subMachineKey = pending.subMachineKey;
  delete pending.subMachineKey;
  const mutated = renderUpdatedFeatureSource(host, { ...hostDraft, current: cur });
  const again = extractStudioMachines([
    {
      fileName: 'llmanspec/specs/host.feature',
      specId: 'host',
      doc: parseCapability(mutated, 'llmanspec/specs/host.feature'),
    },
    {
      fileName: 'llmanspec/specs/child.feature',
      specId: 'child',
      doc: parseCapability(child, 'llmanspec/specs/child.feature'),
    },
  ]);
  ctx.fixtures['r168ExtractRes'] = { extracted, unchanged, host, again };
});

bdd.thenStep('抽出 graphKind 为 flow 且 subMachineKey 与 isGateway 正确', (ctx) => {
  const { extracted } = ctx.fixtures['r168ExtractRes'] as {
    extracted: ReturnType<typeof extractStudioMachines>;
  };
  const hostM = extracted.find((e) => e.machine.capability === 'host')!.machine;
  if (hostM.graphKind !== 'flow') throw new Error(`graphKind ${hostM.graphKind}`);
  const pending = hostM.states.find((s) => s.name === '待审');
  if (pending?.isGateway !== true || pending.subMachineKey !== 'child/r20/审批流') {
    throw new Error(`bad nest/gateway: ${JSON.stringify(pending)}`);
  }
});

bdd.thenStep('无改动写回与原文逐字节相同，改名增删后再抽取语义等价', (ctx) => {
  const { unchanged, host, again } = ctx.fixtures['r168ExtractRes'] as {
    unchanged: string;
    host: string;
    again: ReturnType<typeof extractStudioMachines>;
  };
  if (unchanged !== host) throw new Error('unchanged writeback mutated bytes');
  const hostM = again.find((e) => e.machine.capability === 'host')!.machine;
  if (hostM.states.find((s) => s.name === '审核中')?.subMachineKey !== undefined) {
    throw new Error('nest should have moved off 审核中');
  }
  if (hostM.states.find((s) => s.name === '完成')?.subMachineKey !== 'child/r20/审批流') {
    throw new Error('nest should sit on 完成');
  }
});

bdd.given('一份基线含子机链接的状态机及画布与磁盘两侧不同的嵌套目标', (ctx) => {
  const entries = [
    {
      fileName: 'llmanspec/specs/host.feature',
      specId: 'host',
      doc: parseCapability(FLOW_HOST, 'llmanspec/specs/host.feature'),
    },
    {
      fileName: 'llmanspec/specs/child.feature',
      specId: 'child',
      doc: parseCapability(FLOW_CHILD, 'llmanspec/specs/child.feature'),
    },
  ] satisfies SpecEntry[];
  const extracted = extractStudioMachines(entries);
  const draft = extracted.find((e) => e.machine.capability === 'host')!.draft;
  const ours = cloneMachineIR(draft.current!);
  ours.states.find((s) => s.name === '待审')!.subMachineKey = 'other/r1/alt';
  const theirs = cloneMachineIR(draft.current!);
  theirs.states.find((s) => s.name === '待审')!.subMachineKey = 'third/r2/alt';
  ctx.fixtures['r168Sync'] = { draft: { ...draft, current: ours }, theirs };
});

bdd.when('计算语义 Diff 并对同签名嵌套变更执行 applySyncPicks both', (ctx) => {
  const { draft, theirs } = ctx.fixtures['r168Sync'] as {
    draft: MachineDraft;
    theirs: StudioMachineIR;
  };
  const diff = computeMachineDiff(draft);
  const items = buildSyncItems(draft, theirs);
  const nest = items.find((i) => i.kind === 'nest');
  const blocked = nest
    ? applySyncPicks(draft, items, { [nest.id]: 'both' }, '2026-11-28T00:00:00.000Z')
    : { blocked: [] };
  ctx.fixtures['r168SyncRes'] = { diff, summary: formatSemanticDiff(diff, draft), blocked };
});

bdd.thenStep('Diff 摘要含嵌套链接变更且 both 返回 blocked', (ctx) => {
  const { summary, blocked } = ctx.fixtures['r168SyncRes'] as {
    summary: string;
    blocked: { blocked: Array<{ reason: string }> };
  };
  if (!summary.includes('nest:')) throw new Error(`diff missing nest: ${summary}`);
  if (blocked.blocked.length === 0) throw new Error('expected nest both to be blocked');
});

bdd.given('一份子机互相引用成环的规格与一份悬空 @req 子机引用的规格', (ctx) => {
  const cycleChild = FLOW_CHILD.replace(
    '        | 通过 | back | 草稿 |',
    `        | 通过 | back | 草稿 |

    @states
    场景大纲: 状态属性
      假如 状态 <状态>
      当 读取属性
      那么 子机为 <子机>
      例子:
        | 状态 | 子机 |
        | 草稿 | @req:r10 |`,
  );
  const dangling = FLOW_HOST.replace('@req:r20', '@req:r999');
  ctx.fixtures['r168NestVal'] = { cycleHost: FLOW_HOST, cycleChild, dangling };
});

bdd.when('运行 validateFlowAndNesting', (ctx) => {
  const { cycleHost, cycleChild, dangling } = ctx.fixtures['r168NestVal'] as {
    cycleHost: string;
    cycleChild: string;
    dangling: string;
  };
  const cycleItems = validateFlowAndNesting([
    {
      fileName: 'llmanspec/specs/host.feature',
      specId: 'host',
      doc: parseCapability(cycleHost, 'llmanspec/specs/host.feature'),
    },
    {
      fileName: 'llmanspec/specs/child.feature',
      specId: 'child',
      doc: parseCapability(cycleChild, 'llmanspec/specs/child.feature'),
    },
  ]);
  const danglingItems = validateFlowAndNesting([
    {
      fileName: 'llmanspec/specs/host.feature',
      specId: 'host',
      doc: parseCapability(dangling, 'llmanspec/specs/host.feature'),
    },
  ]);
  ctx.fixtures['r168NestValRes'] = { cycleItems, danglingItems };
});

bdd.thenStep('成环规格报 N2 ERROR 且消息含环路径，悬空规格报 N1 ERROR', (ctx) => {
  const { cycleItems, danglingItems } = ctx.fixtures['r168NestValRes'] as {
    cycleItems: ReturnType<typeof validateFlowAndNesting>;
    danglingItems: ReturnType<typeof validateFlowAndNesting>;
  };
  const n2 = cycleItems.find((i) => i.message.includes('nested machine cycle'));
  if (!n2 || !n2.message.includes('->')) {
    throw new Error(`expected N2 cycle path, got ${JSON.stringify(cycleItems)}`);
  }
  if (!danglingItems.some((i) => i.message.includes('dangling nested machine'))) {
    throw new Error(`expected N1 dangling, got ${JSON.stringify(danglingItems)}`);
  }
});
