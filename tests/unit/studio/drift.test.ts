import { describe, expect, test } from 'bun:test';

import {
  applyDriftProposalsToStateDoc,
  buildDriftRevisionProposals,
  buildDriftSlicePacket,
  createStudioStateDoc,
  extractStudioMachines,
  parseCapability,
  parseRuntimeTraceJsonl,
  parseUnifiedDiffHunks,
  reconcileRuntimeTrace,
  scanLlmanspecAnchors,
  type SpecEntry,
} from '@llman-sdd/core';

const ORDER_SPEC = `# language: zh-CN
# purpose: 订单审批状态流转规范

功能: order

  @req:r12
  规则: 订单审批流转
    订单从待审批经批准或驳回流转至终态。

    @transitions
    场景大纲: 审批主流程
      假如 当前状态为 <from> 且满足 <guard>
      当 触发 <event>
      那么 进入 <to> 状态

      例子:
        | from   | event | guard       | to     |
        | 待审批 | 批准  | 金额<=5000  | 已通过 |
        | 待审批 | 驳回  |             | 已驳回 |
`;

function buildOrderEntries(): SpecEntry[] {
  return [
    {
      specId: 'order',
      fileName: 'llmanspec/specs/order.feature',
      doc: parseCapability(ORDER_SPEC, 'llmanspec/specs/order.feature'),
    },
  ];
}

describe('studio/drift pure domain engine (r149)', () => {
  test('parses JSONL runtime trace and reports malformed lines with 1-based line numbers', () => {
    const raw = [
      '{"machine":"order","from":"待审批","event":"批准","guard":"金额<=5000","to":"已通过"}',
      '{not-json',
      '{"machine":"order","from":"待审批","to":"已通过"}',
      '',
      '{"machine":"order","from":"待审批","event":"超额转审","guard":"","to":"财务复核"}',
    ].join('\n');

    const res = parseRuntimeTraceJsonl(raw);
    expect(res.events.length).toBe(2);
    expect(res.events[0]!.line).toBe(1);
    expect(res.events[0]!.guard).toBe('金额<=5000');
    expect(res.events[1]!.line).toBe(5);
    expect(res.events[1]!.guard).toBeUndefined();

    expect(res.errors.length).toBe(2);
    expect(res.errors[0]!.line).toBe(2);
    expect(res.errors[0]!.message).toContain('invalid JSON');
    expect(res.errors[1]!.line).toBe(3);
    expect(res.errors[1]!.message).toContain('event');
  });

  test('reconciles runtime trace to detect shadow, uncovered, and unknown machines', () => {
    const entries = buildOrderEntries();
    const extracted = extractStudioMachines(entries);
    const machines = extracted.map((m) => m.machine);

    const parsed = parseRuntimeTraceJsonl(
      [
        '{"machine":"order","from":"待审批","event":"批准","guard":"金额<=5000","to":"已通过"}',
        '{"machine":"order/r12/审批主流程","from":"待审批","event":"超额转审","to":"财务复核"}',
        '{"machine":"order","from":"待审批","event":"超额转审","to":"财务复核"}',
        '{"machine":"mystery-flow","from":"A","event":"go","to":"B"}',
      ].join('\n'),
    );

    const rec = reconcileRuntimeTrace(machines, parsed.events);
    expect(rec.totalEvents).toBe(4);
    expect(rec.matchedEvents).toBe(1);

    expect(rec.shadowTransitions.length).toBe(1);
    expect(rec.shadowTransitions[0]).toMatchObject({
      machineKey: 'order/r12/审批主流程',
      from: '待审批',
      event: '超额转审',
      to: '财务复核',
      count: 2,
      sampleLines: [2, 3],
    });

    expect(rec.uncoveredTransitions.length).toBe(1);
    expect(rec.uncoveredTransitions[0]).toMatchObject({
      machineKey: 'order/r12/审批主流程',
      from: '待审批',
      event: '驳回',
      to: '已驳回',
    });

    expect(rec.unknownMachines.length).toBe(1);
    expect(rec.unknownMachines[0]).toMatchObject({
      machine: 'mystery-flow',
      reason: 'not_found',
      count: 1,
      sampleLines: [4],
    });
  });

  test('converts shadow transitions to non-destructive drift-trace proposals idempotently', () => {
    const entries = buildOrderEntries();
    const extracted = extractStudioMachines(entries);
    const doc = createStudioStateDoc({
      id: 'drift-test',
      title: 'Drift Test',
      createdAt: '2026-11-27T00:00:00Z',
      drafts: extracted.map((e) => e.draft),
    });

    const shadows = [
      {
        machineKey: 'order/r12/审批主流程',
        from: '待审批',
        event: '超额转审',
        to: '财务复核',
        count: 3,
        sampleLines: [2, 4, 7],
      },
    ];

    const drafts = buildDriftRevisionProposals(
      { 'order/r12/审批主流程': extracted[0]!.machine },
      shadows,
    );
    expect(drafts.length).toBe(1);
    expect(drafts[0]!.ops).toEqual([
      { op: 'add_state', name: '财务复核' },
      { op: 'add_transition', from: '待审批', event: '超额转审', to: '财务复核' },
    ]);

    const first = applyDriftProposalsToStateDoc(doc, shadows, '2026-11-27T00:05:00Z');
    expect(first.addedProposalIds.length).toBe(1);
    expect(first.doc.revisions[0]!.source).toBe('drift-trace');
    expect(first.doc.revisions[0]!.status).toBe('pending');
    expect(first.doc.machines['order/r12/审批主流程']!.current!.states.length).toBe(3);

    // Repeating with identical shadows is idempotent
    const second = applyDriftProposalsToStateDoc(first.doc, shadows, '2026-11-27T00:06:00Z');
    expect(second.addedProposalIds.length).toBe(0);
    expect(second.doc.revisions.length).toBe(1);
  });

  test('scans TS/Rust/Python @llmanspec: anchors and ignores bare llman comments', () => {
    const tsCode = [
      '// @llmanspec:r12',
      '/* @llmanspec:machine:order/r12/审批主流程 */',
      '// @llman:r99 should be ignored',
      'const s = "@llmanspec:r88 not a comment";',
    ].join('\n');
    const rsCode = '/// @llmanspec:r12\nfn approve() {}';
    const pyCode = '# @llmanspec:r12\ndef approve():\n    pass\n';

    const tsHits = scanLlmanspecAnchors('src/order.ts', tsCode);
    expect(tsHits.map((h) => `${h.kind}:${h.target}@${h.line}`)).toEqual([
      'req:r12@1',
      'machine:order/r12/审批主流程@2',
    ]);
    expect(scanLlmanspecAnchors('src/order.rs', rsCode).map((h) => h.target)).toEqual(['r12']);
    expect(scanLlmanspecAnchors('src/order.py', pyCode).map((h) => h.target)).toEqual(['r12']);
  });

  test('intersects git diff hunks with @llmanspec: anchors to build minimal DriftSlicePacket', () => {
    const entries = buildOrderEntries();
    const diffText = [
      'diff --git a/src/order.ts b/src/order.ts',
      '--- a/src/order.ts',
      '+++ b/src/order.ts',
      '@@ -1,4 +1,5 @@',
      ' // @llmanspec:r12',
      ' export function approve(amount: number) {',
      '+  if (amount > 5000) return "财务复核";',
      '   return "已通过";',
      ' }',
      'diff --git a/src/helper.ts b/src/helper.ts',
      '--- a/src/helper.ts',
      '+++ b/src/helper.ts',
      '@@ -1,2 +1,3 @@',
      ' export function fmt(x: number) {',
      '+  return String(x);',
      ' }',
    ].join('\n');

    const parsedDiff = parseUnifiedDiffHunks(diffText);
    expect(parsedDiff.length).toBe(2);

    const packet = buildDriftSlicePacket({
      sinceRef: 'HEAD~1',
      specEntries: entries,
      diffFiles: [
        {
          file: 'src/order.ts',
          content:
            '// @llmanspec:r12\nexport function approve(amount: number) {\n  if (amount > 5000) return "财务复核";\n  return "已通过";\n}\n',
          hunks: parsedDiff[0]!.hunks,
        },
        {
          file: 'src/helper.ts',
          content: 'export function fmt(x: number) {\n  return String(x);\n}\n',
          hunks: parsedDiff[1]!.hunks,
        },
      ],
    });

    expect(packet.changedFileCount).toBe(2);
    expect(packet.matchedFiles.length).toBe(1);
    expect(packet.matchedFiles[0]!.file).toBe('src/order.ts');
    expect(packet.unanchoredFiles).toEqual(['src/helper.ts']);
    expect(packet.impactedSpecs.length).toBe(1);
    expect(packet.impactedSpecs[0]).toMatchObject({
      kind: 'rule',
      capability: 'order',
      reqId: 'r12',
    });
  });
});
