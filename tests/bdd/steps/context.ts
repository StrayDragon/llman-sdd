// context-index capability step definitions. The no-model env chain and the
// r28/r29 output-contract chains share the `运行 context --task` step: the
// Given selects the backend (real CLI subprocess without model env, or the
// in-process runContextRetrieval seam with an injected fetch mock).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import {
  buildTreeIndex,
  parseCapability,
  runContextRetrieval,
  type ContextResult,
} from '@llman-sdd/core';

import { bdd } from '../runner.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

const MOCK_SPEC = `# language: zh-CN
# capability: alpha
# purpose: mock 检索树
# scope: x/

功能: alpha

  @req:r1 @human
  场景: 规则甲
    - 系统 MUST 甲
`;

type MockMode = 'final-dup' | 'always-tools' | 'http-500';

interface ContextFixture {
  quality: string;
  errorKind: string;
  result?: ContextResult;
}

const TOOL_CALL_PAYLOAD = {
  choices: [
    {
      message: {
        content: null,
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'list_specs', arguments: '{}' } },
        ],
      },
    },
  ],
};

const FINAL_DUP_JSON =
  '{"direct": [{"id": "spec-A", "reason": "a"}, {"id": "spec-B", "reason": "b"}], ' +
  '"related": [{"id": "spec-B", "reason": "b-dup"}, {"id": "spec-C", "reason": "c"}]}';

function buildMockTree(): ReturnType<typeof buildTreeIndex> {
  const entry = {
    fileName: 'llmanspec/specs/alpha.feature',
    doc: parseCapability(MOCK_SPEC, 'alpha.feature'),
  };
  return buildTreeIndex([entry], { specHash: 'h', buildTimestamp: 'x', chatModel: 'mock' });
}

async function runMockRetrieval(
  ctx: { fixtures: Record<string, Record<string, unknown>> },
  mode: MockMode,
): Promise<void> {
  const fetchImpl = (async () => {
    if (mode === 'http-500') return new Response('boom', { status: 500 });
    if (mode === 'always-tools') return new Response(JSON.stringify(TOOL_CALL_PAYLOAD));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: FINAL_DUP_JSON, tool_calls: [] } }] }),
    );
  }) as unknown as typeof fetch;
  const result = await runContextRetrieval({
    config: { model: 'mock', host: 'https://mock.local/v1', apiKey: 'k' },
    task: '随便什么任务',
    tree: buildMockTree(),
    readFile: () => '',
    root: '.',
    fetchImpl,
  });
  ctx.fixtures['context结果'] = {
    quality: result.status.quality,
    errorKind: result.status.errorKind ?? 'none',
    result,
  } as unknown as Record<string, unknown>;
}

bdd.given('环境未设置 LLMAN_SDD_INDEX_CHAT_MODEL', (ctx) => {
  ctx.fixtures['env无模型'] = { value: true };
  return ctx.fixtures['env无模型'] as Record<string, unknown>;
});

bdd.given('注入 mock 模型{scene}', (ctx, scene: string) => {
  let mode: MockMode;
  if (scene.startsWith('其最终回答')) mode = 'final-dup';
  else if (scene.startsWith('每轮都请求工具')) mode = 'always-tools';
  else if (scene.includes('HTTP 500')) mode = 'http-500';
  else throw new Error(`unknown mock scene: ${scene}`);
  ctx.fixtures['contextmock'] = { mode };
  return ctx.fixtures['contextmock'] as Record<string, unknown>;
});

bdd.when('运行 context --task', (ctx) => {
  const mock = ctx.fixtures['contextmock'] as unknown as { mode: MockMode } | undefined;
  if (mock) {
    return runMockRetrieval(ctx, mock.mode);
  }
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('LLMAN_SDD_INDEX_')) env[k] = v;
  }
  const proc = spawnSync('bun', [CLI, 'context', '--task', '随便什么任务'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
  });
  let parsed: { status?: { quality?: string; errorKind?: string } } | null = null;
  try {
    parsed = JSON.parse(proc.stdout ?? '{}');
  } catch {
    parsed = null;
  }
  ctx.fixtures['context结果'] = {
    quality: parsed?.status?.quality ?? 'no-output',
    errorKind: parsed?.status?.errorKind ?? 'none',
  } as unknown as Record<string, unknown>;
  return undefined;
});

bdd.thenStep('quality 为 unavailable', (ctx) => {
  const result = ctx.fixtures['context结果'] as unknown as { quality: string } | undefined;
  if (result?.quality !== 'unavailable') {
    throw new Error(`expected quality=unavailable, got ${result?.quality}`);
  }
});

bdd.thenStep('不发起任何网络请求', (ctx) => {
  // unavailable 分支在发请求前返回;errorKind 必为 api_error 而非网络错误
  const result = ctx.fixtures['context结果'] as unknown as { errorKind: string } | undefined;
  if (result?.errorKind !== 'api_error') {
    throw new Error(`expected api_error (pre-request), got ${result?.errorKind}`);
  }
});

bdd.thenStep('direct 仅含 spec-A 与 spec-B 且 related 仅含 spec-C', (ctx) => {
  const result = ctx.fixtures['context结果'] as unknown as { result?: ContextResult } | undefined;
  const direct = result?.result?.direct.map((e) => e.id) ?? [];
  const related = result?.result?.related.map((e) => e.id) ?? [];
  if (JSON.stringify(direct) !== JSON.stringify(['spec-A', 'spec-B'])) {
    throw new Error(`expected direct [spec-A, spec-B], got ${JSON.stringify(direct)}`);
  }
  if (JSON.stringify(related) !== JSON.stringify(['spec-C'])) {
    throw new Error(`expected related [spec-C], got ${JSON.stringify(related)}`);
  }
});

bdd.thenStep(
  'summary 的 tierDirect 为 {a:d} 且 tierRelated 为 {b:d}',
  (ctx, a: number, b: number) => {
    const result = ctx.fixtures['context结果'] as unknown as { result?: ContextResult } | undefined;
    const summary = result?.result?.summary;
    if (!summary || !('tierDirect' in summary))
      throw new Error(`no success summary: ${JSON.stringify(summary)}`);
    if (summary.tierDirect !== a || summary.tierRelated !== b) {
      throw new Error(
        `expected tierDirect=${a} tierRelated=${b}, got ${summary.tierDirect}/${summary.tierRelated}`,
      );
    }
  },
);

bdd.when('运行 context --task 直至轮次耗尽', (ctx) => {
  const mock = ctx.fixtures['contextmock'] as unknown as { mode: MockMode } | undefined;
  if (!mock) throw new Error('loop-exhaustion scenario requires the mock-model Given');
  return runMockRetrieval(ctx, mock.mode);
});

bdd.thenStep('quality 为 agentic 且 qualityNote 含截断注记', (ctx) => {
  const result = ctx.fixtures['context结果'] as unknown as { result?: ContextResult } | undefined;
  const status = result?.result?.status;
  if (status?.quality !== 'agentic' || !status.ok) {
    throw new Error(`expected ok agentic, got ${JSON.stringify(status)}`);
  }
  if (!status.qualityNote.includes('tool-call limit')) {
    throw new Error(`qualityNote lacks truncation note: ${status.qualityNote}`);
  }
});

bdd.thenStep('direct 与 related 均为空', (ctx) => {
  const result = ctx.fixtures['context结果'] as unknown as { result?: ContextResult } | undefined;
  if ((result?.result?.direct.length ?? -1) !== 0 || (result?.result?.related.length ?? -1) !== 0) {
    throw new Error(
      `expected empty tiers, got direct=${result?.result?.direct.length} related=${result?.result?.related.length}`,
    );
  }
});

bdd.thenStep('quality 为 unavailable 且 errorKind 为 api_error', (ctx) => {
  const result = ctx.fixtures['context结果'] as unknown as { result?: ContextResult } | undefined;
  const status = result?.result?.status;
  if (status?.quality !== 'unavailable' || status.errorKind !== 'api_error') {
    throw new Error(`expected unavailable/api_error, got ${JSON.stringify(status)}`);
  }
});

bdd.thenStep('summary 为 totalSpecs 0 且 error true', (ctx) => {
  const result = ctx.fixtures['context结果'] as unknown as { result?: ContextResult } | undefined;
  const summary = result?.result?.summary;
  if (!summary || !('error' in summary) || summary.totalSpecs !== 0 || summary.error !== true) {
    throw new Error(`expected {totalSpecs:0,error:true}, got ${JSON.stringify(summary)}`);
  }
});
