import { describe, expect, test } from 'bun:test';

import {
  STUDIO_VIEWS_REL,
  buildForestGraph,
  computeCrossForestBridges,
  defaultStudioViewsDoc,
  parseCapability,
  readStudioViews,
  validateForestIsolation,
  writeStudioViews,
  type SpecEntry,
  type StudioViewsIo,
} from '@llman-sdd/core';

const ORDER_SPEC = `# language: zh-CN
# purpose: 订单流转状态机

功能: order

  @req:r10
  @domain-commerce
  规则: 订单流转
    前置依赖 @req:r20 的风控判定规则。

    @transitions
    场景大纲: 订单主流程
      假如 当前处于 <from>
      当 触发 <event>
      那么 进入 <to>

      例子:
        | from   | event | to     |
        | 待支付 | 支付  | 已支付 |
`;

const RISK_SPEC = `# language: zh-CN
# purpose: 风控决策表

功能: risk

  @req:r20
  @domain-risk
  规则: 风控分级
    根据金额和信用分输出放行或拦截。

    场景大纲: 风控表
      假如 金额 <amount> 且信用 <credit>
      当 评估
      那么 结果 <decision>

      例子:
        | amount | credit | decision |
        | <=5000 | 高     | 放行     |
        | >5000  | 低     | 拦截     |
`;

const BILLING_FLOW_SPEC = `# language: zh-CN
# purpose: 结算审批流程

功能: billing

  @req:r30
  @flow
  规则: 结算流水线
    后置调用 @req:r10 完成订单核销。

    @transitions
    场景大纲: 结算流程
      假如 步骤 <from>
      当 执行 <event>
      那么 下一步 <to>

      例子:
        | from | event | to   |
        | 汇总 | 入账  | 完成 |
`;

const ORPHAN_DOC_SPEC = `# language: zh-CN
# purpose: 独立帮助说明

功能: help-doc

  @req:r40
  规则: 独立说明
    仅用于文字说明，无跨能力引用。
`;

function buildFixtureEntries(): SpecEntry[] {
  return [
    {
      specId: 'order',
      fileName: 'llmanspec/specs/order.feature',
      doc: parseCapability(ORDER_SPEC, 'llmanspec/specs/order.feature'),
    },
    {
      specId: 'risk',
      fileName: 'llmanspec/specs/risk.feature',
      doc: parseCapability(RISK_SPEC, 'llmanspec/specs/risk.feature'),
    },
    {
      specId: 'billing',
      fileName: 'llmanspec/specs/billing.feature',
      doc: parseCapability(BILLING_FLOW_SPEC, 'llmanspec/specs/billing.feature'),
    },
    {
      specId: 'help-doc',
      fileName: 'llmanspec/specs/help-doc.feature',
      doc: parseCapability(ORPHAN_DOC_SPEC, 'llmanspec/specs/help-doc.feature'),
    },
  ];
}

describe('studio/forest pure projection, bridges, W3 linter, and views.json (r153)', () => {
  test('classifies 4 node kinds, computes weights, extracts evidence edges, bridges, and W3 isolation', () => {
    const graph = buildForestGraph(buildFixtureEntries());
    expect(graph.nodes.length).toBe(4);

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get('order')?.kind).toBe('machine');
    expect(byId.get('billing')?.kind).toBe('flow');
    expect(byId.get('risk')?.kind).toBe('decision');
    expect(byId.get('help-doc')?.kind).toBe('doc');
    expect(byId.get('order')?.weight).toBe(4.5);
    expect(byId.get('help-doc')?.weight).toBe(1);

    // Upstream-aware: risk -> order via @req:r20; downstream: billing -> order via @req:r10
    const riskToOrder = graph.edges.find((e) => e.from === 'risk' && e.to === 'order');
    const billingToOrder = graph.edges.find((e) => e.from === 'billing' && e.to === 'order');
    expect(riskToOrder).toBeDefined();
    expect(riskToOrder!.evidence[0]!.targetReqId).toBe('r20');
    expect(billingToOrder).toBeDefined();
    expect(billingToOrder!.evidence[0]!.targetReqId).toBe('r10');

    // Cross-Forest Bridges
    const bridges = computeCrossForestBridges(graph, [
      { id: 'g-commerce', capabilities: ['order', 'billing'] },
      { id: 'g-risk', capabilities: ['risk'] },
    ]);
    expect(bridges.bridges.length).toBe(1);
    expect(bridges.bridges[0]).toMatchObject({
      from: 'risk',
      to: 'order',
      fromGroupId: 'g-risk',
      toGroupId: 'g-commerce',
    });
    expect(bridges.bridgeNodeIds.sort()).toEqual(['order', 'risk']);

    // W3 isolated spec diagnostic
    const diags = validateForestIsolation(graph);
    expect(diags.length).toBe(1);
    expect(diags[0]).toMatchObject({ code: 'W3', severity: 'warning', capability: 'help-doc' });
  });

  test('atomically reads and writes .llman-sdd/studio/views.json via temp file + rename', () => {
    const files = new Map<string, string>();
    const dirs = new Set<string>();
    const renames: Array<{ from: string; to: string }> = [];
    const io: StudioViewsIo = {
      exists: (p) => files.has(p) || dirs.has(p),
      readText: (p) => files.get(p) ?? '',
      writeText: (p, text) => {
        files.set(p, text);
      },
      rename: (from, to) => {
        const text = files.get(from) ?? '';
        files.delete(from);
        files.set(to, text);
        renames.push({ from, to });
      },
      mkdirp: (d) => {
        dirs.add(d);
      },
      currentPid: () => 4242,
      now: () => new Date('2026-11-27T00:00:00Z'),
    };

    const initial = readStudioViews(io);
    expect(initial.views.length).toBe(1);
    expect(initial.views[0]!.id).toBe('main');
    expect(initial.views[0]!.pinned).toBe(true);

    const updated = defaultStudioViewsDoc('2026-11-27T01:00:00Z');
    updated.views.push({
      id: 'tab-commerce',
      title: '交易核心',
      includedCapabilities: ['order', 'billing'],
      showExternalHops: true,
      bridgeOnly: false,
      manualLinks: [{ id: 'ml1', fromCap: 'order', toCap: 'risk', label: '人工关联' }],
      manualGroups: [
        { id: 'mg1', title: '交易域', tone: 'blue', capabilities: ['order', 'billing'] },
      ],
      macroPositions: { order: { x: 100, y: 120 } },
    });

    const rel = writeStudioViews(io, updated);
    expect(rel).toBe(STUDIO_VIEWS_REL);
    expect(renames.length).toBe(1);
    expect(renames[0]!.from).toContain('.views.tmp.4242');
    expect(renames[0]!.to).toBe(STUDIO_VIEWS_REL);

    const reloaded = readStudioViews(io);
    expect(reloaded.views.length).toBe(2);
    expect(reloaded.views[1]!.manualLinks[0]!.label).toBe('人工关联');
  });
});
