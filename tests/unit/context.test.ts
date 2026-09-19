import { describe, expect, test } from 'bun:test';

import {
  buildTreeIndex,
  computeSpecHash,
  loadTreeWithAutoRebuild,
  parseLock,
  resolveChatConfig,
  runContextRetrieval,
  type HashIo,
  type IndexIo,
  type SpecEntry,
} from '@llman-sdd/core';
import { parseCapability } from '@llman-sdd/core';

const SPEC_A = `# language: zh-CN
# capability: alpha
# purpose: alpha 用途
# scope: x/

功能: alpha

  @req:r1 @human
  场景: 规则甲
    - 系统 MUST 甲

  @req:r1 @executable
  场景: 验收甲
    假如 初始状态
    当 执行动作
    那么 得到结果
`;

const hashIo: HashIo = {
  exists: (p) => p === 'llmanspec/specs',
  isDirectory: (p) => p === 'llmanspec/specs',
  listDir: () => ['a.feature', 'b.feature'],
  readText: (p) => (p.endsWith('a.feature') ? SPEC_A : '# stub\n'),
};

function entry(): SpecEntry {
  return { fileName: 'llmanspec/specs/a.feature', doc: parseCapability(SPEC_A, 'a.feature') };
}

describe('buildTreeIndex', () => {
  test('serializes snake_case docs with reqs and scenarios', () => {
    const tree = buildTreeIndex([entry()], {
      specHash: 'deadbeef',
      buildTimestamp: '2026-09-15T00:00:00Z',
      chatModel: '',
    });
    expect(tree.version).toBe(1);
    expect(tree.spec_hash).toBe('deadbeef');
    expect(tree.docs[0]?.spec_id).toBe('alpha');
    expect(tree.docs[0]?.purpose).toBe('alpha 用途');
    expect(tree.docs[0]?.reqs[0]).toEqual({
      req_id: 'r1',
      title: '规则甲',
      statement: '系统 MUST 甲',
    });
    const scenario = tree.docs[0]?.scenarios[0];
    expect(scenario?.id).toBe('验收甲');
    expect(scenario?.given).toBe('初始状态');
    expect(scenario?.when).toBe('执行动作');
    expect(scenario?.then).toBe('得到结果');
  });

  test('computeSpecHash changes when spec content changes', () => {
    const before = computeSpecHash('llmanspec/specs', hashIo);
    const changingIo: HashIo = {
      ...hashIo,
      readText: (p) => (p.endsWith('a.feature') ? `${SPEC_A}\n# trailing\n` : '# stub\n'),
    };
    const after = computeSpecHash('llmanspec/specs', changingIo);
    expect(before).not.toBe(after);
    expect(computeSpecHash('llmanspec/specs', hashIo)).toBe(before);
  });
});

describe('parseLock', () => {
  test('parses pid and started_at', () => {
    const lock = parseLock('pid = 1234\nstarted_at = "2026-09-15T00:00:00Z"\nchunks_total = 1\n');
    expect(lock).toEqual({ pid: 1234, startedAt: '2026-09-15T00:00:00Z' });
  });
  test('garbage → null', () => {
    expect(parseLock('nonsense')).toBeNull();
  });
});

describe('resolveChatConfig', () => {
  test('model required → null when unset', () => {
    expect(resolveChatConfig({})).toBeNull();
  });
  test('CHAT_* wins over OPENAI_* fallbacks', () => {
    const cfg = resolveChatConfig({
      LLMAN_SDD_INDEX_CHAT_MODEL: 'm1',
      LLMAN_SDD_INDEX_CHAT_API_HOST: 'https://chat.example/v1',
      LLMAN_SDD_INDEX_CHAT_API_KEY: 'k1',
      LLMAN_SDD_INDEX_OPENAI_API_HOST: 'https://openai.example/v1',
    });
    expect(cfg).toEqual({ model: 'm1', host: 'https://chat.example/v1', apiKey: 'k1' });
  });
  test('OPENAI_* fallback applies without CHAT_*', () => {
    const cfg = resolveChatConfig({
      LLMAN_SDD_INDEX_CHAT_MODEL: 'm1',
      LLMAN_SDD_INDEX_OPENAI_API_HOST: 'https://openai.example/v1',
      LLMAN_SDD_INDEX_OPENAI_API_KEY: 'k2',
    });
    expect(cfg).toEqual({ model: 'm1', host: 'https://openai.example/v1', apiKey: 'k2' });
  });
});

describe('runContextRetrieval (mock fetch agentic loop)', () => {
  test('tool round then final JSON classification', async () => {
    const requests: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string, init?: { body?: string }) => {
      requests.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>);
      const round = requests.length;
      if (round === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call-1',
                      type: 'function',
                      function: { name: 'list_specs', arguments: '{}' },
                    },
                  ],
                },
              },
            ],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"direct": [{"id": "alpha", "reason": "governs the change"}], "related": []}',
                tool_calls: [],
              },
            },
          ],
        }),
      );
    }) as typeof fetch;

    const tree = buildTreeIndex([entry()], {
      specHash: 'h',
      buildTimestamp: '2026-09-15T00:00:00Z',
      chatModel: 'mock',
    });
    const result = await runContextRetrieval({
      config: { model: 'mock', host: 'https://mock.example/v1', apiKey: 'k' },
      task: '修改 alpha 的行为',
      tree,
      readFile: () => '',
      root: '.',
      fetchImpl,
    });

    expect(result.status.ok).toBe(true);
    expect(result.status.quality).toBe('agentic');
    expect(result.direct).toEqual([{ id: 'alpha', reason: 'governs the change' }]);
    expect(result.summary).toEqual({
      totalSpecs: 1,
      tierDirect: 1,
      tierRelated: 0,
      unrelatedCount: 0,
      toolCalls: 1,
      staleWarnings: [],
      readRecommended: ['alpha'],
      paths: [],
    });
    expect(requests).toHaveLength(2);
    // 第一轮带 tools;回填轮的工具结果消息存在
    expect(requests[0]?.['tools']).toBeDefined();
    const messages = requests[1]?.['messages'] as { role: string }[];
    expect(messages.some((m) => m.role === 'tool')).toBe(true);
  });

  test('r29 HTTP failure → unavailable + error summary shape', async () => {
    const fetchImpl = (async () =>
      new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const tree = buildTreeIndex([], { specHash: 'h', buildTimestamp: 'x', chatModel: 'mock' });
    const result = await runContextRetrieval({
      config: { model: 'mock', host: 'https://mock.example/v1', apiKey: 'k' },
      task: 't',
      tree,
      readFile: () => '',
      root: '.',
      fetchImpl,
    });
    expect(result.status.ok).toBe(false);
    expect(result.status.quality).toBe('unavailable');
    expect(result.status.errorKind).toBe('api_error');
    expect(result.summary).toEqual({ totalSpecs: 0, error: true });
  });

  test('r29 network throw → unavailable + error summary shape', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const tree = buildTreeIndex([], { specHash: 'h', buildTimestamp: 'x', chatModel: 'mock' });
    const result = await runContextRetrieval({
      config: { model: 'mock', host: 'https://mock.example/v1', apiKey: 'k' },
      task: 't',
      tree,
      readFile: () => '',
      root: '.',
      fetchImpl,
    });
    expect(result.status.ok).toBe(false);
    expect(result.status.quality).toBe('unavailable');
    expect(result.status.errorKind).toBe('api_error');
    expect(result.summary).toEqual({ totalSpecs: 0, error: true });
  });

  test('r29 loop exhaustion degrades to agentic + truncation note + empty tiers', async () => {
    const toolCallPayload = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'list_specs', arguments: '{}' } },
            ],
          },
        },
      ],
    };
    const fetchImpl = (async () =>
      new Response(JSON.stringify(toolCallPayload))) as unknown as typeof fetch;
    const tree = buildTreeIndex([], { specHash: 'h', buildTimestamp: 'x', chatModel: 'mock' });
    const result = await runContextRetrieval({
      config: { model: 'mock', host: 'https://mock.example/v1', apiKey: 'k' },
      task: 't',
      tree,
      readFile: () => '',
      root: '.',
      fetchImpl,
    });
    expect(result.status.ok).toBe(true);
    expect(result.status.quality).toBe('agentic');
    expect(result.status.qualityNote).toContain('12-round tool-call limit');
    expect(result.direct).toEqual([]);
    expect(result.related).toEqual([]);
    if (!('tierDirect' in result.summary)) throw new Error('expected success summary shape');
    expect(result.summary.tierDirect).toBe(0);
    expect(result.summary.toolCalls).toBe(13);
  });

  test('r28 cross-tier duplicate keeps direct entry and drops related', async () => {
    const finalJson =
      '{"direct": [{"id": "spec-A", "reason": "a"}, {"id": "spec-B", "reason": "b"}], ' +
      '"related": [{"id": "spec-B", "reason": "b-dup"}, {"id": "spec-C", "reason": "c"}]}';
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: finalJson, tool_calls: [] } }] }),
      )) as unknown as typeof fetch;
    const tree = buildTreeIndex([], { specHash: 'h', buildTimestamp: 'x', chatModel: 'mock' });
    const result = await runContextRetrieval({
      config: { model: 'mock', host: 'https://mock.example/v1', apiKey: 'k' },
      task: 't',
      tree,
      readFile: () => '',
      root: '.',
      fetchImpl,
    });
    expect(result.direct.map((e) => e.id)).toEqual(['spec-A', 'spec-B']);
    expect(result.related.map((e) => e.id)).toEqual(['spec-C']);
    if (!('tierDirect' in result.summary)) throw new Error('expected success summary shape');
    expect(result.summary.tierDirect).toBe(2);
    expect(result.summary.tierRelated).toBe(1);
  });

  test('r28 in-tier duplicate keeps first occurrence', async () => {
    const finalJson =
      '{"direct": [{"id": "spec-A", "reason": "first"}, {"id": "spec-A", "reason": "second"}], "related": []}';
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: finalJson, tool_calls: [] } }] }),
      )) as unknown as typeof fetch;
    const tree = buildTreeIndex([], { specHash: 'h', buildTimestamp: 'x', chatModel: 'mock' });
    const result = await runContextRetrieval({
      config: { model: 'mock', host: 'https://mock.example/v1', apiKey: 'k' },
      task: 't',
      tree,
      readFile: () => '',
      root: '.',
      fetchImpl,
    });
    expect(result.direct).toEqual([{ id: 'spec-A', reason: 'first' }]);
  });
});

describe('loadTreeWithAutoRebuild (r62)', () => {
  function memIndexIo(specContent: { value: string }): IndexIo & { files: Map<string, string> } {
    const files = new Map<string, string>();
    return {
      files,
      exists: (p) => p === 'llmanspec/specs' || files.has(p),
      isDirectory: (p) => p === 'llmanspec/specs',
      listDir: (p) => (p === 'llmanspec/specs' ? ['a.feature'] : []),
      readText: (p) => {
        if (p === 'llmanspec/specs/a.feature') return specContent.value;
        const v = files.get(p);
        if (v === undefined) throw new Error(`missing ${p}`);
        return v;
      },
      writeText: (p, c) => {
        files.set(p, c);
      },
      remove: (p) => {
        files.delete(p);
      },
      mkdirp: () => {},
      processAlive: () => true,
    };
  }

  test('missing index is rebuilt once and retrieval proceeds', () => {
    const io = memIndexIo({ value: SPEC_A });
    const r = loadTreeWithAutoRebuild(io, 'llmanspec/specs', [entry()], { chatModel: '' });
    expect(r.error).toBeNull();
    expect(r.rebuilt).toBe(true);
    expect(r.tree).not.toBeNull();
  });

  test('fresh index short-circuits without rebuild', () => {
    const io = memIndexIo({ value: SPEC_A });
    loadTreeWithAutoRebuild(io, 'llmanspec/specs', [entry()], { chatModel: '' });
    const r = loadTreeWithAutoRebuild(io, 'llmanspec/specs', [entry()], { chatModel: '' });
    expect(r.rebuilt).toBe(false);
    expect(r.error).toBeNull();
  });

  test('stale index is silently rebuilt', () => {
    const spec = { value: SPEC_A };
    const io = memIndexIo(spec);
    loadTreeWithAutoRebuild(io, 'llmanspec/specs', [entry()], { chatModel: '' });
    spec.value = SPEC_A.replace('MUST 甲', 'MUST 乙');
    const r = loadTreeWithAutoRebuild(io, 'llmanspec/specs', [entry()], { chatModel: '' });
    expect(r.rebuilt).toBe(true);
    expect(r.error).toBeNull();
    expect(r.tree).not.toBeNull();
  });

  test('rebuild failure surfaces index_rebuild_failed', () => {
    const io = memIndexIo({ value: SPEC_A });
    io.files.set(
      'llmanspec/.context/pageindex/.rebuild.lock',
      `pid = ${process.pid}\nstarted_at = "${new Date().toISOString()}"\n`,
    );
    const r = loadTreeWithAutoRebuild(io, 'llmanspec/specs', [entry()], { chatModel: '' });
    expect(r.tree).toBeNull();
    expect(r.error).toContain('auto-rebuild failed');
  });
});
