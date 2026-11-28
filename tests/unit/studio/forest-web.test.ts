import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  defaultStudioViewsDoc,
  viewsResponseSchema,
  type SpecIndexEdge,
  type SpecIndexItem,
} from '@llman-sdd/core';

import { createStudioHubApp } from '../../../apps/cli/src/studio-server/server.ts';
import {
  aggregateWorkspaceTags,
  filterWorkspaceSpecs,
} from '../../../apps/studio/src/components/NewTabQuickPage.tsx';
import {
  buildExclusiveDomainGroupsWithManual,
  computeFocusAdjacencySet,
  computeOneHopExternalCaps,
  enforceExclusiveGroupSpaces,
  extractPortalEvidence,
  layoutMainViewWithGroups,
} from '../../../apps/studio/src/routing/domainGroups.ts';

const SAMPLE_SPEC = `# language: zh-CN
# purpose: 验证 views.json 隔离与门户证据

功能: order

  @req:r10
  @commerce
  规则: 订单流转
    前置依赖 @req:r20 完成风控审查。

    @transitions
    场景大纲: 订单主流程
      假如 处于 <from>
      当 触发 <event>
      那么 进入 <to>

      例子:
        | from   | event | to     |
        | 待支付 | 支付  | 已支付 |
`;

const RISK_SPEC = `# language: zh-CN
# purpose: 风控规则

功能: risk

  @req:r20
  @security
  规则: 风控审查
    校验高额交易。
`;

describe('studio forest tabs server /api/views and frontend pure invariants (r154, r155)', () => {
  test('GET/PUT /api/views atomically persists workspace-isolated views.json with 400 validation and zero specs mutation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llman-studio-views-'));
    try {
      mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
      writeFileSync(join(dir, 'llmanspec', 'config.yaml'), 'version: "1.0"\nlocale: zh-Hans\n');
      const orderPath = join(dir, 'llmanspec', 'specs', 'order.feature');
      writeFileSync(orderPath, SAMPLE_SPEC);
      writeFileSync(join(dir, 'llmanspec', 'specs', 'risk.feature'), RISK_SPEC);

      const hub = createStudioHubApp({
        initialDirectory: dir,
        host: '127.0.0.1',
        port: 4710,
        writeHubFile: false,
      });
      try {
        const req = (p: string, init?: RequestInit) =>
          hub.app.request(`http://127.0.0.1:4710${p}`, init);

        // Default single pinned Main View tab
        const get1 = await req('/api/views');
        expect(get1.status).toBe(200);
        const parsed1 = viewsResponseSchema.parse(await get1.json());
        expect(parsed1.viewsDoc.views.length).toBe(1);
        expect(parsed1.viewsDoc.views[0]!.id).toBe('main');
        expect(parsed1.viewsDoc.views[0]!.pinned).toBe(true);

        // Invalid payload -> 400
        const badPut = await req('/api/views', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
          body: JSON.stringify({ viewsDoc: { version: 99 } }),
        });
        expect(badPut.status).toBe(400);

        // Valid custom Forest Tab + manual dashed link
        const nextDoc = defaultStudioViewsDoc('2026-11-27T02:00:00Z');
        nextDoc.views.push({
          id: 'view-commerce',
          title: '交易核心',
          includedCapabilities: ['order'],
          showExternalHops: true,
          bridgeOnly: false,
          manualLinks: [{ id: 'ml1', fromCap: 'order', toCap: 'risk', label: '参考虚线' }],
          manualGroups: [{ id: 'mg1', title: '交易域', tone: 'blue', capabilities: ['order'] }],
          macroPositions: {},
        });
        const putRes = await req('/api/views', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
          body: JSON.stringify({ viewsDoc: nextDoc }),
        });
        expect(putRes.status).toBe(200);

        const get2 = await req('/api/views');
        const parsed2 = viewsResponseSchema.parse(await get2.json());
        expect(parsed2.viewsDoc.views.length).toBe(2);
        expect(parsed2.viewsDoc.views[1]!.manualLinks[0]!.label).toBe('参考虚线');

        // Bootstrap edges carry real ForestEdge evidence
        const bootRes = await req('/api/bootstrap');
        const boot = (await bootRes.json()) as { edges: SpecIndexEdge[] };
        expect(boot.edges.length).toBe(1);
        expect(boot.edges[0]!.evidence?.[0]?.targetReqId).toBe('r20');

        // Zero modification to llmanspec/specs/
        expect(readFileSync(orderPath, 'utf8')).toBe(SAMPLE_SPEC);
      } finally {
        hub.cleanup();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('enforceExclusiveGroupSpaces prevents non-member containment & helpers compute 1-hop, adjacency, tags, and portal evidence', () => {
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
        summary: '订单流转',
        reqPreview: ['@req:r10'],
        tags: ['#commerce'],
        stale: false,
      },
      {
        id: 'billing',
        title: 'billing',
        file: 'llmanspec/specs/billing.feature',
        kind: 'flow',
        hardness: 'tested',
        ruleCount: 1,
        scenarioCount: 1,
        decisionTableCount: 0,
        machineKeys: ['billing/r11/flow'],
        summary: '账单结算',
        reqPreview: ['@req:r11'],
        tags: ['#commerce'],
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
        summary: '非成员规格',
        reqPreview: ['@req:r99'],
        tags: ['#ops'],
        stale: false,
      },
    ];

    const { groups, ungroupedIds } = buildExclusiveDomainGroupsWithManual(
      specs,
      [{ id: 'mg-c', title: '交易域', tone: 'blue', capabilities: ['order', 'billing'] }],
      new Set(),
    );
    expect(groups.length).toBe(1);
    expect(ungroupedIds).toEqual(['intruder']);

    // Adversarially place 'intruder' right inside the group box!
    const layout = layoutMainViewWithGroups(
      specs,
      groups,
      ungroupedIds,
      new Set(),
      { intruder: { x: 80, y: 110 } },
      'map',
    );
    const gb = layout.groupBoxes[0]!;
    const intrPos = layout.specPositions['intruder']!;
    const cardW = 254;
    const cardH = 158;
    const stillOverlaps =
      intrPos.x < gb.x + gb.width &&
      intrPos.x + cardW > gb.x &&
      intrPos.y < gb.y + gb.height &&
      intrPos.y + cardH > gb.y;
    expect(stillOverlaps).toBe(false);

    // Direct call check
    const pos2 = { intruder: { x: gb.x + 10, y: gb.y + 10 } };
    enforceExclusiveGroupSpaces(pos2, layout.groupBoxes, cardW, cardH);
    expect(pos2.intruder.y).toBeGreaterThanOrEqual(gb.y + gb.height);

    // 1-hop external & focus adjacency & portal evidence
    const edges: SpecIndexEdge[] = [
      {
        id: 'ref_1',
        from: 'intruder',
        to: 'order',
        label: '@req:r99',
        kind: 'spec-ref',
        evidence: [{ sourceReqId: 'r10', targetReqId: 'r99', summary: '前置依赖 @req:r99' }],
      },
    ];
    expect(computeOneHopExternalCaps(['order'], edges)).toEqual(['intruder']);
    expect(Array.from(computeFocusAdjacencySet('order', edges)).sort()).toEqual([
      'intruder',
      'order',
    ]);
    const ev = extractPortalEvidence('order', 'upstream', 'intruder', edges);
    expect(ev.length).toBe(1);
    expect(ev[0]!.targetReqId).toBe('r99');

    // Workspace dynamic tags & 0-hit filter
    const tags = aggregateWorkspaceTags(specs, { intruder: ['#custom'] });
    expect(tags.map((t) => `${t.tag}:${t.count}`)).toEqual(['#commerce:2', '#custom:1', '#ops:1']);
    expect(filterWorkspaceSpecs(specs, 'no-such-capability', null)).toEqual([]);
  });
});
