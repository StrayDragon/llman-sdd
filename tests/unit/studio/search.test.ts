import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  addStudioComment,
  buildDemoStudioWebDrafts,
  buildWorkspaceSearchDocuments,
  createStudioStateDoc,
  extractHighlightSnippet,
  parseCapability,
  searchWorkspaceBm25,
  studioSearchResponseSchema,
  tokenizeSearchText,
} from '@llman-sdd/core';

import { createStudioHubApp } from '../../../apps/cli/src/studio-server/server.ts';
import { collectInPanelMatches } from '../../../apps/studio/src/components/InPanelFindBar.tsx';

const SAMPLE_SPEC = `# language: zh-CN
# purpose: 支付幂等锁与超时退回规则

功能: payment-lock

  @req:r401
  规则: 幂等锁超时自动退回
    当下游网关 30 秒无响应时，支付单 MUST 释放幂等锁并执行超时退回。

    @transitions
    场景大纲: 支付流转
      假如 处于 <from>
      当 触发 <event>
      那么 进入 <to>

      例子:
        | from   | event    | guard    | to     |
        | 锁定中 | 超时退回 | 超过30秒 | 已退回 |
        | 锁定中 | 支付成功 | 校验通过 | 已完成 |
`;

describe('studio search & recall (r158, r159)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  test('CJK bigram + ASCII tokenizer & BM25 recall rules, guards, and comments', () => {
    const tokens = tokenizeSearchText('幂等锁 超时退回 @req:r401');
    expect(tokens).toContain('@req:r401');
    expect(tokens).toContain('幂等');
    expect(tokens).toContain('等锁');
    expect(tokens).toContain('超时');

    const doc = parseCapability(SAMPLE_SPEC, 'payment-lock.feature');
    let stateDoc = createStudioStateDoc({
      id: 'ws-test',
      title: 'Test',
      drafts: [],
      createdAt: '2026-11-27T00:00:00.000Z',
    });
    stateDoc = addStudioComment(stateDoc, {
      anchor: { kind: 'doc', capability: 'payment-lock' },
      author: 'human',
      body: '这里需要核对分布式幂等锁续租策略',
      createdAt: '2026-11-27T00:00:00.000Z',
    });
    const indexed = buildWorkspaceSearchDocuments([{ capId: 'payment-lock', doc }], stateDoc);

    const cnHits = searchWorkspaceBm25(indexed, '幂等锁');
    expect(cnHits.length).toBeGreaterThanOrEqual(2);
    expect(cnHits.some((h) => h.targetKind === 'rule' && h.targetId === 'r401')).toBe(true);
    expect(cnHits.some((h) => h.targetKind === 'comment')).toBe(true);
    expect(cnHits[0]!.snippet.length).toBeGreaterThan(0);

    const idHits = searchWorkspaceBm25(indexed, '@req:r401');
    expect(idHits[0]?.targetId).toBe('r401');
    expect(
      extractHighlightSnippet('前置很长说明 '.repeat(25) + '核心超时退回逻辑', '超时退回', 60),
    ).toContain('超时退回');
  });

  test('in-panel find penetrates L2/L3 nested sub-machines', () => {
    const demoMachines = buildDemoStudioWebDrafts();
    const stateDoc = createStudioStateDoc({
      id: 'demo',
      title: 'Demo',
      drafts: demoMachines,
      createdAt: '2026-11-27T00:00:00.000Z',
    });
    const rootKey = Object.keys(stateDoc.machines)[0]!;
    const matches = collectInPanelMatches({
      tabKind: 'machine',
      specs: [],
      stateDoc,
      activeMachineKey: rootKey,
      specDetail: undefined,
      query: '校验',
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.machineKey === rootKey)).toBe(true);
  });

  test('/api/search isolates workspace, blocks non-loopback RAG SSRF, and falls back gracefully', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llman-sdd-search-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
    writeFileSync(join(dir, 'llmanspec', 'specs', 'payment-lock.feature'), SAMPLE_SPEC);

    const hub = createStudioHubApp({
      initialDirectory: dir,
      host: '127.0.0.1',
      port: 0,
      writeHubFile: false,
    });
    cleanups.push(() => hub.cleanup());

    const postSearch = (body: unknown) =>
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

    // 1. Tier 0 local BM25
    const r1 = await postSearch({ query: '超时退回' });
    expect(r1.status).toBe(200);
    const d1 = studioSearchResponseSchema.parse(await r1.json());
    expect(d1.provider).toBe('local-bm25');
    expect(d1.hits.length).toBeGreaterThan(0);
    expect(d1.hits[0]!.capId).toBe('payment-lock');

    // 2. Non-loopback RAG URL blocked (SSRF 400)
    const r2 = await postSearch({ query: '超时退回', endpoint: 'https://evil.example.com' });
    expect(r2.status).toBe(400);

    // 3. Unreachable loopback RAG URL degrades seamlessly to local-bm25
    const r3 = await postSearch({ query: '超时退回', endpoint: 'http://127.0.0.1:1' });
    expect(r3.status).toBe(200);
    const d3 = studioSearchResponseSchema.parse(await r3.json());
    expect(d3.provider).toBe('local-bm25');
    expect(d3.degradedReason).toBeTruthy();
    expect(d3.hits.length).toBeGreaterThan(0);
  });
});
