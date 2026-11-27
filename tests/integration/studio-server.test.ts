import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bootstrapResponseSchema,
  healthResponseSchema,
  putStateResponseSchema,
  specDetailResponseSchema,
  textfoldResponseSchema,
} from '@llman-sdd/core';

import { resolveLiveHub, writeHubInfoFile } from '../../apps/cli/src/studio-server/hub.ts';
import { createStudioHubApp } from '../../apps/cli/src/studio-server/server.ts';
import {
  loadStudioAsset,
  parseEmbeddedStudioAssets,
  resetEmbeddedStudioAssetsCache,
} from '../../apps/cli/src/studio-server/static.ts';

const SAMPLE_SPEC = `# language: zh-CN
# purpose: 验证订单状态流转与决策规则

功能: order-flow

  @req:r1
  规则: 订单状态机
    订单 MUST 按合法状态流转。

    @transitions
    场景大纲: 订单主流程
      假如 当前处于 <from> 状态
      当 触发 <event> 事件
      那么 流转至 <to> 状态

      例子:
        | from | event | to   |
        | 草稿 | 提交  | 待审 |
        | 待审 | 通过  | 完成 |

  @req:r2
  规则: 审批等级真值表
    金额决定审批人。

    场景大纲: 审批判定
      假如 金额为 <amount>
      当 评估审批
      那么 审批人为 <approver>

      例子:
        | amount | approver |
        | <=5000 | 组长     |
        | >5000  | 总监     |
`;

describe('studio local Hono Hub integration (r144, r145, r147)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) fn();
    }
  });

  function makeTempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'llman-studio-hub-'));
    mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
    mkdirSync(join(dir, 'llmanspec', 'changes'), { recursive: true });
    writeFileSync(
      join(dir, 'llmanspec', 'config.yaml'),
      'version: "1.0"\nlocale: zh-Hans\n',
      'utf8',
    );
    writeFileSync(join(dir, 'llmanspec', 'specs', 'order-flow.feature'), SAMPLE_SPEC, 'utf8');
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  test('health, Zod bootstrap/lazy-spec, loopback security, 409 lock, content negotiation, textfold & export', async () => {
    const repoDir = makeTempRepo();
    const hubFile = join(repoDir, '.tmp-hub.json');

    // Zombie lock self-healing check
    writeHubInfoFile(hubFile, {
      pid: 999999,
      port: 65431,
      host: '127.0.0.1',
      token: 'stale-token',
      version: '0.11.0',
      startedAt: '2026-11-27T00:00:00Z',
    });
    expect(await resolveLiveHub(hubFile)).toBeNull();
    expect(existsSync(hubFile)).toBe(false);

    const hub = createStudioHubApp({
      initialDirectory: repoDir,
      host: '127.0.0.1',
      port: 4710,
      demo: true,
      writeHubFile: false,
    });
    cleanups.push(() => hub.cleanup());

    const req = (path: string, init?: RequestInit) =>
      hub.app.request(`http://127.0.0.1:4710${path}`, init);

    // 1) Health check
    const healthRes = await req('/api/health');
    expect(healthRes.status).toBe(200);
    const health = healthResponseSchema.parse(await healthRes.json());
    expect(health.ok).toBe(true);

    // 2) Bootstrap lightweight index + lazy spec detail
    const bootRes = await req('/api/bootstrap');
    expect(bootRes.status).toBe(200);
    const boot = bootstrapResponseSchema.parse(await bootRes.json());
    expect(boot.specs.length).toBe(1);
    expect(boot.specs[0]?.id).toBe('order-flow');

    const detailRes = await req('/api/specs/order-flow');
    expect(detailRes.status).toBe(200);
    const detail = specDetailResponseSchema.parse(await detailRes.json());
    expect(detail.rules.length).toBe(2);
    expect(detail.decisionTables.length).toBe(1);
    expect(detail.foldLevels.length).toBe(5);

    // 3) Loopback security: missing token & non-loopback Origin rejected with 403
    const noTokRes = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ doc: boot.stateDoc }),
    });
    expect(noTokRes.status).toBe(403);

    const badOriginRes = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
        'x-studio-token': hub.token,
      },
      body: JSON.stringify({ doc: boot.stateDoc }),
    });
    expect(badOriginRes.status).toBe(403);

    // 4) Invalid Zod payload returns 400
    const badZodRes = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ doc: { version: 999 } }),
    });
    expect(badZodRes.status).toBe(400);

    // 5) Optimistic revision lock: first write succeeds (rev=1), stale expectedRevision=0 returns 409
    const put1 = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-studio-token': hub.token,
        'x-studio-client-id': 'tab-a',
      },
      body: JSON.stringify({ doc: boot.stateDoc, expectedRevision: 0 }),
    });
    expect(put1.status).toBe(200);
    const put1Data = putStateResponseSchema.parse(await put1.json());
    expect(put1Data.revision).toBe(1);

    const putStale = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ doc: boot.stateDoc, expectedRevision: 0 }),
    });
    expect(putStale.status).toBe(409);

    // 6) Cold layouts & edgeBends persistence + reload via GET /api/layouts and /api/bootstrap
    const layRes = await req(`/api/layouts/${encodeURIComponent('order-flow/r1/订单主流程')}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({
        positions: { s1: { x: 100, y: 200 } },
        edgeBends: { e1: { dx: 12, dy: -16 } },
      }),
    });
    expect(layRes.status).toBe(200);
    const getLayRes = await req(`/api/layouts/${encodeURIComponent('order-flow/r1/订单主流程')}`);
    expect(getLayRes.status).toBe(200);
    const getLayJson = (await getLayRes.json()) as {
      positions: Record<string, { x: number; y: number }>;
      edgeBends: Record<string, { dx: number; dy: number }>;
    };
    expect(getLayJson.positions.s1).toEqual({ x: 100, y: 200 });
    expect(getLayJson.edgeBends.e1).toEqual({ dx: 12, dy: -16 });

    const bootAfterLayout = bootstrapResponseSchema.parse(
      await (await req('/api/bootstrap')).json(),
    );
    expect(bootAfterLayout.stateDoc.layouts['order-flow/r1/订单主流程']?.s1).toEqual({
      x: 100,
      y: 200,
    });
    expect(bootAfterLayout.stateDoc.edgeBends?.['order-flow/r1/订单主流程']?.e1).toEqual({
      dx: 12,
      dy: -16,
    });

    // 6b) wsKey never ends with trailing '.' & malformed If-Match returns 400
    expect(boot.workspace.wsKey.endsWith('.')).toBe(false);
    const badIfMatch = await req(`/api/states/${boot.activeStateId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-studio-token': hub.token,
        'if-match': 'not-a-number',
      },
      body: JSON.stringify({ doc: boot.stateDoc }),
    });
    expect(badIfMatch.status).toBe(400);

    // 6c) Non-loopback bind throws & TextFold SSRF endpoint rejected with 400
    expect(() =>
      createStudioHubApp({ initialDirectory: repoDir, host: '0.0.0.0', writeHubFile: false }),
    ).toThrow(/loopback/u);
    const ssrfRes = await req('/api/textfold/fold', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({
        content: 'fresh content for ssrf test',
        endpoint: 'https://evil.example.com/fold',
      }),
    });
    expect(ssrfRes.status).toBe(400);

    // 6d) Compiled binary embedded object-literal & JSON-string static assets work cleanly
    expect(
      parseEmbeddedStudioAssets({
        'index.html': { encoding: 'utf8', content: '<html>obj-ok</html>' },
      })?.['index.html']?.content,
    ).toBe('<html>obj-ok</html>');
    const prevEmb = process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS;
    try {
      process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS = JSON.stringify({
        'index.html': { encoding: 'utf8', content: '<html>embedded-ok</html>' },
      });
      resetEmbeddedStudioAssetsCache();
      const loaded = loadStudioAsset('index.html');
      expect(loaded).not.toBeNull();
      expect(new TextDecoder().decode(loaded!.bytes)).toBe('<html>embedded-ok</html>');
    } finally {
      if (prevEmb === undefined) {
        delete process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS;
      } else {
        process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS = prevEmb;
      }
      resetEmbeddedStudioAssetsCache();
    }

    // 7) Transparent HTTP GET Content Negotiation on /p/:wsKey
    const wsPath = `/p/${encodeURIComponent(boot.workspace.wsKey)}`;
    const mdRes = await req(wsPath, { headers: { accept: '*/*' } });
    expect(mdRes.status).toBe(200);
    expect(mdRes.headers.get('content-type')).toContain('text/markdown');
    const mdText = await mdRes.text();
    expect(mdText).toContain('order-flow');
    expect(mdText).toContain('?format=json');

    const jsonRes = await req(`${wsPath}?format=json`);
    expect(jsonRes.status).toBe(200);
    const jsonPayload = (await jsonRes.json()) as { focus: { wsKey: string } };
    expect(jsonPayload.focus.wsKey).toBe(boot.workspace.wsKey);

    const htmlRes = await req(wsPath, { headers: { accept: 'text/html' } });
    expect(htmlRes.status).toBe(200);
    const htmlText = await htmlRes.text();
    expect(htmlText).toContain('id="studio-focus-context"');

    // 8) TextFold Tier 0 offline fallback + cache hit on 2nd call
    const tf1 = await req('/api/textfold/fold', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ content: SAMPLE_SPEC, capability: 'order-flow' }),
    });
    expect(tf1.status).toBe(200);
    const tf1Data = textfoldResponseSchema.parse(await tf1.json());
    expect(tf1Data.provider).toBe('local-ast');
    expect(tf1Data.cached).toBe(false);

    const tf2 = await req('/api/textfold/fold', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({ content: SAMPLE_SPEC, capability: 'order-flow' }),
    });
    const tf2Data = textfoldResponseSchema.parse(await tf2.json());
    expect(tf2Data.cached).toBe(true);

    // 9) Export proposal creates proposal.md and NEVER modifies llmanspec/specs/
    const expRes = await req(`/api/states/${boot.activeStateId}/export-proposal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
      body: JSON.stringify({
        changeId: 'refine-order-flow',
        title: '优化订单状态流转',
        why: '测试从 Studio 导出提案且零直写 specs',
      }),
    });
    expect(expRes.status).toBe(201);
    expect(
      existsSync(join(repoDir, 'llmanspec', 'changes', 'refine-order-flow', 'proposal.md')),
    ).toBe(true);
    expect(readFileSync(join(repoDir, 'llmanspec', 'specs', 'order-flow.feature'), 'utf8')).toBe(
      SAMPLE_SPEC,
    );
  });
});
