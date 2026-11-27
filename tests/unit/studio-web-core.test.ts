import { describe, expect, test } from 'bun:test';

import {
  addStudioComment,
  buildDemoStudioWebDrafts,
  cloneMachineIR,
  compileDecisionTableToTree,
  computeMachineDiff,
  computeWorldlineOverlayDiff,
  createMachineDraft,
  createStudioStateDoc,
  deleteStudioComment,
  detectConvertibleStructure,
  editStudioComment,
  extractDecisionTables,
  foldFeatureAst,
  hasBlockingDiagnostics,
  parseCapability,
  parseStudioStateDoc,
  recordWorldlineCommit,
  reopenStudioComment,
  resolveStudioComment,
  studioStateDocSchema,
  switchWorldlineHead,
  validateMachineGraph,
  type StudioStateDoc,
} from '@llman-sdd/core';

describe('studio-web core pure extensions (r143, r145, r146)', () => {
  test('self-hosting 3-layer studio-web demo drafts pass E1-E4 with zero blocking errors', () => {
    const drafts = buildDemoStudioWebDrafts();
    expect(drafts.length).toBe(3);
    for (const draft of drafts) {
      expect(draft.current).not.toBeNull();
      const diags = validateMachineGraph(draft.current!);
      expect(hasBlockingDiagnostics(diags)).toBe(false);
    }
    const l1 = drafts[0]!.current!;
    const l2 = drafts[1]!.current!;
    const l3 = drafts[2]!.current!;
    const editState = l1.states.find((s) => s.name === '画布直编与草稿态');
    expect(editState?.subMachineKey).toBe(l2.machineKey);
    const wireState = l2.states.find((s) => s.name === '端口拖线连接');
    expect(wireState?.subMachineKey).toBe(l3.machineKey);
  });

  test('non-destructive multi-branch Worldline preserves sibling human & agent branches', () => {
    const [l1] = buildDemoStudioWebDrafts();
    const key = l1!.current!.machineKey;
    let doc: StudioStateDoc = createStudioStateDoc({
      id: 'wl-test',
      title: 'Worldline test',
      createdAt: '2026-11-27T00:00:00Z',
      drafts: [l1!],
    });

    const branchA = cloneMachineIR(doc.machines[key]!.current!);
    branchA.states.push({ uid: 's99', name: '人工方案A' });
    doc = recordWorldlineCommit(doc, key, branchA, {
      label: 'Human branch A',
      createdAt: '2026-11-27T00:01:00Z',
      actor: 'human',
      branchRef: 'sdd/test',
    });

    // Switch back to BASE (index 0) and create parallel Agent branch B — MUST NOT truncate branch A!
    doc = switchWorldlineHead(doc, key, 0, '2026-11-27T00:02:00Z');
    const branchB = cloneMachineIR(doc.machines[key]!.current!);
    branchB.states.push({ uid: 's100', name: 'Agent反提案B' });
    doc = recordWorldlineCommit(doc, key, branchB, {
      label: 'Agent counter-proposal B',
      createdAt: '2026-11-27T00:03:00Z',
      actor: 'agent',
      parentId: 'BASE',
    });

    const tl = doc.timelines[key]!;
    expect(tl.entries.length).toBe(3);
    expect(tl.entries[1]?.id).toBe('#1');
    expect(tl.entries[1]?.parentId).toBe('BASE');
    expect(tl.entries[1]?.actor).toBe('human');
    expect(tl.entries[2]?.id).toBe('#2');
    expect(tl.entries[2]?.parentId).toBe('BASE');
    expect(tl.entries[2]?.actor).toBe('agent');
    expect(tl.headIdx).toBe(2);

    const overlay = computeWorldlineOverlayDiff(tl.entries[1]!.snapshot, tl.entries[2]!.snapshot);
    expect(overlay.addedStateUids).toEqual(['s100']);
    expect(overlay.removedStates.map((s) => s.uid)).toEqual(['s99']);

    // Schema roundtrip preserves parentId, actor, revision, docDrafts, edgeBends
    const enriched: StudioStateDoc = {
      ...doc,
      baseHashes: { 'llmanspec/specs/studio-web.feature': 'abc123' },
      docDrafts: {
        'studio-web': {
          sourceFile: 'llmanspec/specs/studio-web.feature',
          baseHash: 'abc123',
          currentText: '# updated',
          changeKind: 'wording',
        },
      },
      edgeBends: { [key]: { e1: { dx: 18, dy: -24 } } },
    };
    const parsed = parseStudioStateDoc(JSON.stringify(enriched));
    expect(parsed.docDrafts?.['studio-web']?.changeKind).toBe('wording');
    expect(parsed.edgeBends?.[key]?.e1).toEqual({ dx: 18, dy: -24 });
    expect(studioStateDocSchema.safeParse(parsed).success).toBe(true);
  });

  test('5-kind unified comments support full CRUD (add, edit, resolve, reopen, delete)', () => {
    const [l1] = buildDemoStudioWebDrafts();
    let doc = createStudioStateDoc({
      id: 'comment-crud',
      title: 'Comment CRUD',
      createdAt: '2026-11-27T00:00:00Z',
      drafts: [l1!],
    });
    doc = addStudioComment(doc, {
      anchor: { kind: 'forest', capability: 'studio-web' },
      author: 'human',
      body: 'Initial note',
      createdAt: '2026-11-27T00:01:00Z',
    });
    doc = addStudioComment(doc, {
      anchor: { kind: 'doc', capability: 'validation', reqId: 'r104' },
      author: 'human',
      body: 'Rule note',
      createdAt: '2026-11-27T00:02:00Z',
    });
    doc = editStudioComment(doc, 'c1', { body: 'Edited note', updatedAt: '2026-11-27T00:03:00Z' });
    expect(doc.comments.find((c) => c.id === 'c1')?.body).toBe('Edited note');
    doc = resolveStudioComment(doc, 'c1', '2026-11-27T00:04:00Z');
    expect(doc.comments.find((c) => c.id === 'c1')?.status).toBe('resolved');
    doc = reopenStudioComment(doc, 'c1', '2026-11-27T00:05:00Z');
    expect(doc.comments.find((c) => c.id === 'c1')?.status).toBe('open');
    doc = deleteStudioComment(doc, 'c2', '2026-11-27T00:06:00Z');
    expect(doc.comments.length).toBe(1);
  });

  test('computeMachineDiff cancels delete+recreate edge churn with identical semantic signature', () => {
    const [l1] = buildDemoStudioWebDrafts();
    const base = cloneMachineIR(l1!.current!);
    const cur = cloneMachineIR(l1!.current!);
    const originalEdge = cur.transitions.shift()!;
    cur.transitions.push({ ...originalEdge, uid: 'e_new_recreated' });

    const diff = computeMachineDiff({
      mode: 'modify',
      baseline: base,
      current: cur,
      sourceFile: 'llmanspec/specs/studio-web.feature',
    });
    expect(diff.hasChanges).toBe(false);
    expect(diff.transitionsAdded).toEqual([]);
    expect(diff.transitionsRemoved).toEqual([]);
  });

  test('flowchart dialect linter (F1-F4) is strictly isolated from E1-E4', () => {
    const flowDraft = createMachineDraft({
      capability: 'demo-flow',
      reqId: 'f1',
      ruleTitle: '流水线流程',
      scenarioName: '步骤执行',
      sourceFile: 'llmanspec/specs/demo-flow.feature',
      columns: { from: 'from', event: 'event', to: 'to' },
      states: [{ name: '开始', initial: true }, { name: '条件判断1' }, { name: '孤立步骤' }],
      transitions: [{ from: '开始', event: '校验', to: '条件判断1' }],
    });
    const flowIr = flowDraft.current!;
    flowIr.graphKind = 'flow';
    flowIr.states[1]!.isGateway = true;

    const diags = validateMachineGraph(flowIr);
    const codes = new Set(diags.map((d) => d.code));
    expect(codes.has('F2')).toBe(true);
    expect(codes.has('F3')).toBe(true);
    expect(codes.has('F4')).toBe(true);
    expect(codes.has('E3')).toBe(false);
  });

  test('0-LLM decision table compiler & Tier 0 AST textfold work deterministically', () => {
    const featureSrc = `# language: zh-CN
# purpose: 校验文件组合推断阶段

功能: sample-decision

  @req:r1
  规则: 阶段推断
    按文件存在与否确定性推断变更阶段。

    场景大纲: 文件组合推断 stage
      假如 design 为 <design>、tasks 为 <tasks>
      当 推断阶段
      那么 阶段为 <stage>

      例子:
        | design | tasks | stage    |
        | 无     | 无    | draft    |
        | 有     | 无    | designed |
        | 有     | 有    | planned  |
`;
    const doc = parseCapability(featureSrc, 'sample-decision.feature');
    const tables = extractDecisionTables(doc);
    expect(tables.length).toBe(1);
    const tree = compileDecisionTableToTree(tables[0]!.headers, tables[0]!.rows);
    expect(tree.nodes.filter((n) => n.kind === 'condition').length).toBe(2);
    expect(tree.nodes.filter((n) => n.kind === 'outcome').length).toBe(3);
    expect(tree.edges.length).toBe(4);

    const levels = foldFeatureAst(doc, featureSrc);
    expect(levels.length).toBe(5);
    expect(levels[4]).toContain('sample-decision');
    expect(levels[3]).toContain('共 1 条规格规则');
    expect(detectConvertibleStructure(doc, false, true)).toBeNull();
  });
});
