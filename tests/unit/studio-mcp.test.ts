import { expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  STUDIO_STATES_REL,
  addStudioComment,
  createStudioStateDoc,
  extractStudioMachines,
  parseCapability,
  readStudioState,
  writeStudioState,
  type SpecEntry,
  type StudioStateDoc,
} from '@llman-sdd/core';

import { makeNodeStudioStateIo } from '../../apps/cli/src/commands/studio.ts';
import {
  McpToolError,
  STUDIO_MCP_TOOL_NAMES,
  createLinkedMcpTransports,
  createStudioMcpServer,
  resolveMcpInstanceRoot,
} from '../../apps/cli/src/commands/studioMcp.ts';
import { CLI, initGitRepo } from '../helpers/spawn.ts';

function runCliIn(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
  return {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Drive a real `llman-sdd studio mcp` subprocess over stdio using line-delimited JSON-RPC.
 * Waits for every request ID to be answered before closing stdin so in-flight requests settle cleanly.
 */
async function runStdioMcpSession(
  cwd: string,
  extraArgs: string[],
  messages: Array<Record<string, unknown>>,
): Promise<{
  code: number;
  rawStdout: string;
  stderr: string;
  responses: Map<number, JsonRpcResponse>;
}> {
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const child = spawn('bun', [CLI, 'studio', 'mcp', ...extraArgs], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const expectedIds = new Set<number>();
  for (const m of messages) {
    if (typeof m.id === 'number') expectedIds.add(m.id);
  }

  let rawStdout = '';
  let stderr = '';
  let buf = '';
  const responses = new Map<number, JsonRpcResponse>();

  const exitPromise = new Promise<number>((resolveExit, rejectExit) => {
    child.on('error', rejectExit);
    child.on('close', (code) => resolveExit(code ?? 1));
  });

  const doneReceiving = new Promise<void>((resolveAll, rejectAll) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectAll(
        new Error(
          `MCP stdio session timed out waiting for ids [${[...expectedIds].join(', ')}].\nstdout:\n${rawStdout}\nstderr:\n${stderr}`,
        ),
      );
    }, 15_000);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      rawStdout += text;
      buf += text;
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line !== '') {
          try {
            const parsed = JSON.parse(line) as JsonRpcResponse;
            if (typeof parsed.id === 'number') {
              responses.set(parsed.id, parsed);
              expectedIds.delete(parsed.id);
              if (expectedIds.size === 0) {
                clearTimeout(timer);
                resolveAll();
              }
            }
          } catch {
            // Leave rawStdout intact so caller assertions can detect non-JSON-RPC pollution.
          }
        }
        nl = buf.indexOf('\n');
      }
    });

    child.on('close', () => {
      clearTimeout(timer);
      resolveAll();
    });
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  for (const m of messages) {
    child.stdin.write(`${JSON.stringify(m)}\n`);
  }

  await doneReceiving;
  child.stdin.end();
  const code = await exitPromise;
  return { code, rawStdout, stderr, responses };
}

function parseToolPayload(resp: JsonRpcResponse | undefined): {
  isError: boolean;
  data: Record<string, unknown>;
} {
  if (!resp || !resp.result) {
    throw new Error(`expected JSON-RPC result, got: ${JSON.stringify(resp)}`);
  }
  const content = resp.result.content as Array<{ type: string; text: string }> | undefined;
  const text = content?.[0]?.text ?? '{}';
  return {
    isError: resp.result.isError === true,
    data: JSON.parse(text) as Record<string, unknown>,
  };
}

const SAMPLE_EXPENSE_FEATURE = `# language: zh-CN
# purpose: 定义 expense 能力的状态流转与行为合约。

功能: expense

  @req:r10
  规则: 报销状态流转
    报销单 MUST 按审批流转表推进状态。

    @transitions
    场景大纲: 报销主流程
      假如 当前处于 <初始状态> 状态且满足 <守卫>
      当 触发 <事件> 事件
      那么 流转至 <目标状态> 状态

      例子:
        | 初始状态 | 事件 | 守卫 | 目标状态 |
        | 草稿 | 提交 |  | 待审批 |
        | 待审批 | 批准 | 金额<=5000 | 已通过 |
        | 待审批 | 驳回 |  | 已驳回 |
`;

function makeTempRepo(opts: { legacyBddConfig?: boolean } = {}): {
  root: string;
  cleanup: () => void;
} {
  const raw = mkdtempSync(join(tmpdir(), 'llman-sdd-studio-mcp-'));
  const root = realpathSync(raw);
  initGitRepo(root, 'main');
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  const configYaml = opts.legacyBddConfig
    ? 'schema: spec-driven\nlocale: zh-Hans\nbdd:\n  run_command: "bun test tests/bdd"\n'
    : 'schema: spec-driven\nlocale: zh-Hans\n';
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), configYaml);
  writeFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), SAMPLE_EXPENSE_FEATURE);
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'init studio mcp repo'], { cwd: root });
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function seedDraft(
  root: string,
  id: string,
  opts: { withComment?: boolean; brokenE3?: boolean } = {},
): StudioStateDoc {
  const entry: SpecEntry = {
    fileName: 'llmanspec/specs/expense.feature',
    specId: 'expense',
    doc: parseCapability(SAMPLE_EXPENSE_FEATURE, 'llmanspec/specs/expense.feature'),
  };
  const draft = extractStudioMachines([entry])[0]!.draft;
  draft.current!.states[1]!.name = '主管审批';
  if (opts.brokenE3) {
    draft.current!.states.push({ uid: 's99', name: '孤岛状态' });
  }
  let doc = createStudioStateDoc({
    id,
    title: `Draft ${id}`,
    createdAt: '2026-11-26T12:00:00Z',
    drafts: [draft],
  });
  if (opts.withComment) {
    doc = addStudioComment(doc, {
      anchor: { kind: 'state', machineKey: draft.current!.machineKey, stateUid: 's2' },
      author: 'human',
      body: '请确认主管审批是否需要金额上限守卫',
      createdAt: '2026-11-26T12:01:00Z',
    });
  }
  writeStudioState(makeNodeStudioStateIo(root), doc);
  return doc;
}

test('T1: --print-config outputs valid snippets for all 4 clients (exit 0) and rejects invalid client (exit 2)', () => {
  const outside = mkdtempSync(join(tmpdir(), 'llman-sdd-mcp-cfg-'));
  try {
    for (const client of ['claude-code', 'cursor', 'generic'] as const) {
      const res = runCliIn(['studio', 'mcp', '--print-config', client], outside);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout) as {
        mcpServers: { 'llman-sdd-studio': { command: string; args: string[] } };
      };
      expect(parsed.mcpServers['llman-sdd-studio'].command).toBe('llman-sdd');
      expect(parsed.mcpServers['llman-sdd-studio'].args).toEqual(['studio', 'mcp']);
    }

    // Bare --print-config defaults to generic
    const bare = runCliIn(['studio', 'mcp', '--print-config'], outside);
    expect(bare.code).toBe(0);
    expect(JSON.parse(bare.stdout)).toHaveProperty('mcpServers.llman-sdd-studio');

    // Codex TOML + optional --directory pinning
    const codex = runCliIn(
      ['studio', 'mcp', '--print-config', 'codex', '--directory', '/repo/wt1'],
      outside,
    );
    expect(codex.code).toBe(0);
    expect(codex.stdout).toContain('[mcp_servers.llman-sdd-studio]');
    expect(codex.stdout).toContain('command = "llman-sdd"');
    expect(codex.stdout).toContain('args = ["studio", "mcp", "--directory", "/repo/wt1"]');

    // Invalid client -> exit 2
    const invalid = runCliIn(['studio', 'mcp', '--print-config', 'vscode-unknown'], outside);
    expect(invalid.code).toBe(2);
    expect(invalid.stderr).toContain('Error:');
    expect(invalid.stderr).toContain('vscode-unknown');
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('T1: --transport http fails explicitly with exit 1 and invalid transport exits 2', () => {
  const outside = mkdtempSync(join(tmpdir(), 'llman-sdd-mcp-tr-'));
  try {
    const httpRes = runCliIn(['studio', 'mcp', '--transport', 'http'], outside);
    expect(httpRes.code).toBe(1);
    expect(httpRes.stderr).toContain('Error:');
    expect(httpRes.stderr).toContain('not yet implemented');

    const badRes = runCliIn(['studio', 'mcp', '--transport', 'websocket'], outside);
    expect(badRes.code).toBe(2);
    expect(badRes.stderr).toContain('invalid --transport');
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('T2: resolveMcpInstanceRoot handles single-repo, non-git, multi-worktree guard, explicit directory, and pinned --directory', () => {
  const repo = makeTempRepo();
  const wtParent = mkdtempSync(join(tmpdir(), 'llman-sdd-mcp-wt-'));
  const nonGit = mkdtempSync(join(tmpdir(), 'llman-sdd-mcp-nongit-'));
  const emptyDir = mkdtempSync(join(tmpdir(), 'llman-sdd-mcp-empty-'));

  try {
    // 1. Single worktree -> zero-friction default
    const single = resolveMcpInstanceRoot(undefined, { cwd: repo.root });
    expect(single.instanceRoot).toBe(repo.root);
    expect(single.branch).toBe('main');

    // 2. Non-git directory with llmanspec/ -> treated as single repo
    mkdirSync(join(nonGit, 'llmanspec', 'specs'), { recursive: true });
    const nonGitResolved = resolveMcpInstanceRoot(undefined, { cwd: nonGit });
    expect(nonGitResolved.instanceRoot).toBe(nonGit);
    expect(nonGitResolved.branch).toBeNull();

    // 3. No llmanspec root -> McpToolError
    expect(() => resolveMcpInstanceRoot(emptyDir, { cwd: repo.root })).toThrow(McpToolError);

    // 4. Add a second linked worktree
    const wt2Path = join(wtParent, 'wt-feature');
    const addWt = spawnSync('git', ['worktree', 'add', '-qb', 'feat/wt2', wt2Path], {
      cwd: repo.root,
      encoding: 'utf8',
    });
    expect(addWt.status).toBe(0);
    const wt2Real = realpathSync(wt2Path);

    // 5. Omitting directory when unpinned -> rejected with ALL worktree paths
    let caught: unknown;
    try {
      resolveMcpInstanceRoot(undefined, { cwd: repo.root });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(McpToolError);
    const mcpErr = caught as McpToolError;
    expect(mcpErr.code).toBe('multiple_worktrees_detected');
    expect(mcpErr.message).toContain(repo.root);
    expect(mcpErr.message).toContain(wt2Real);

    // 6. Explicit directory -> targets wt2 cleanly
    const explicit = resolveMcpInstanceRoot(wt2Real, { cwd: repo.root });
    expect(explicit.instanceRoot).toBe(wt2Real);
    expect(explicit.branch).toBe('feat/wt2');

    // 7. Launch-pinned --directory -> allows omitting tool directory
    const pinned = resolveMcpInstanceRoot(undefined, { cwd: repo.root, pinnedDirectory: wt2Real });
    expect(pinned.instanceRoot).toBe(wt2Real);
    expect(pinned.branch).toBe('feat/wt2');
  } finally {
    spawnSync('git', ['worktree', 'prune'], { cwd: repo.root });
    repo.cleanup();
    rmSync(wtParent, { recursive: true, force: true });
    rmSync(nonGit, { recursive: true, force: true });
    rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('T2: MCP server honors unique client root via roots/list when directory is omitted', async () => {
  const repo = makeTempRepo();
  const outside = mkdtempSync(join(tmpdir(), 'llman-sdd-mcp-clientroot-'));
  try {
    seedDraft(repo.root, 'from-root');
    const server = await createStudioMcpServer({ cwd: outside });
    const [clientTransport, serverTransport] = await createLinkedMcpTransports();
    const received: Array<Record<string, unknown>> = [];

    Object.assign(clientTransport, {
      onmessage: (msg: unknown) => {
        const record = msg as Record<string, unknown>;
        // Respond to server's roots/list request with the unique repo file:// URI
        if (record.method === 'roots/list' && record.id !== undefined) {
          void clientTransport.send({
            jsonrpc: '2.0',
            id: record.id as number | string,
            result: {
              roots: [{ uri: pathToFileURL(repo.root).href, name: 'repo' }],
            },
          });
          return;
        }
        received.push(record);
      },
    });

    await server.connect(serverTransport);
    await clientTransport.start();

    await clientTransport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: { roots: {} },
        clientInfo: { name: 'unit-test', version: '1.0.0' },
      },
    });
    await clientTransport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    await clientTransport.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'studio_list_states', arguments: {} },
    });

    // Wait briefly for async roundtrip
    const deadline = Date.now() + 3000;
    while (!received.some((m) => m.id === 2) && Date.now() < deadline) {
      await Bun.sleep(10);
    }

    const listResp = received.find((m) => m.id === 2) as JsonRpcResponse | undefined;
    const { isError, data } = parseToolPayload(listResp);
    expect(isError).toBe(false);
    expect(data.instanceRoot).toBe(repo.root);
    expect(data.branch).toBe('main');
    expect((data.states as Array<{ id: string }>).map((s) => s.id)).toEqual(['from-root']);

    await server.close();
  } finally {
    repo.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

test('T2+T3: full 5-tool stdio roundtrip preserves human draft and never touches llmanspec/specs/', async () => {
  const repo = makeTempRepo();
  try {
    const seeded = seedDraft(repo.root, 'negotiate-1', { withComment: true, brokenE3: true });
    const machineKey = Object.keys(seeded.machines)[0]!;
    const specPath = join(repo.root, 'llmanspec', 'specs', 'expense.feature');
    const specBefore = readFileSync(specPath, 'utf8');
    const humanCurrentBefore = JSON.stringify(seeded.machines[machineKey]!.current);

    const session = await runStdioMcpSession(
      repo.root,
      [],
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'studio_list_states', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'studio_get_diff', arguments: { includeUnified: true } },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'studio_validate_draft', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'studio_validate_draft',
            arguments: {
              patchOps: [{ op: 'remove_state', stateName: '孤岛状态' }],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'studio_reply_comment',
            arguments: {
              stateId: 'negotiate-1',
              commentId: 'c1',
              body: '已核对，保留金额<=5000 守卫',
              resolve: true,
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {
            name: 'studio_propose_revision',
            arguments: {
              stateId: 'negotiate-1',
              machineKey,
              rationale: '移除孤岛状态以通过 E3 连通性校验',
              ops: [{ op: 'remove_state', stateName: '孤岛状态' }],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'studio_propose_revision',
            arguments: {
              stateId: 'negotiate-1',
              machineKey,
              rationale: 'invalid op should not persist',
              ops: [{ op: 'remove_state', stateName: '不存在的状态' }],
            },
          },
        },
      ],
    );

    expect(session.code).toBe(0);

    // 1. tools/list exposes ONLY the 5 negotiation tools (no direct spec-write tool)
    const toolsResp = session.responses.get(2);
    const tools = (toolsResp?.result?.tools as Array<{ name: string }>) ?? [];
    expect(tools.map((t) => t.name).toSorted()).toEqual([...STUDIO_MCP_TOOL_NAMES].toSorted());

    // 2. studio_list_states
    const listRes = parseToolPayload(session.responses.get(3));
    expect(listRes.isError).toBe(false);
    expect(listRes.data.instanceRoot).toBe(repo.root);
    expect(listRes.data.branch).toBe('main');
    expect((listRes.data.states as Array<{ id: string }>).map((s) => s.id)).toEqual([
      'negotiate-1',
    ]);

    // 3. studio_get_diff
    const diffRes = parseToolPayload(session.responses.get(4));
    expect(diffRes.isError).toBe(false);
    expect(diffRes.data.instanceRoot).toBe(repo.root);
    expect(diffRes.data.branch).toBe('main');
    expect(diffRes.data.stateId).toBe('negotiate-1');
    const unified = diffRes.data.unifiedDiff as Record<string, string | null>;
    expect(unified[machineKey]).toContain('+++ b/llmanspec/specs/expense.feature');
    expect((diffRes.data.comments as unknown[]).length).toBe(1);

    // 4. studio_validate_draft (unpatched -> E3 error; patched -> ok without writing disk)
    const valRaw = parseToolPayload(session.responses.get(5));
    expect(valRaw.isError).toBe(false);
    expect(valRaw.data.ok).toBe(false);
    expect(valRaw.data.instanceRoot).toBe(repo.root);
    expect(valRaw.data.branch).toBe('main');

    const valPatched = parseToolPayload(session.responses.get(6));
    expect(valPatched.isError).toBe(false);
    expect(valPatched.data.ok).toBe(true);
    expect(valPatched.data.patched).toBe(true);

    // 5. studio_reply_comment
    const replyRes = parseToolPayload(session.responses.get(7));
    expect(replyRes.isError).toBe(false);
    expect(replyRes.data.instanceRoot).toBe(repo.root);
    expect(replyRes.data.branch).toBe('main');
    expect((replyRes.data.comment as { replyTo: string; author: string }).replyTo).toBe('c1');
    expect((replyRes.data.comment as { author: string }).author).toBe('agent');

    // 6. studio_propose_revision
    const revRes = parseToolPayload(session.responses.get(8));
    expect(revRes.isError).toBe(false);
    expect(revRes.data.instanceRoot).toBe(repo.root);
    expect(revRes.data.branch).toBe('main');
    expect((revRes.data.revision as { status: string }).status).toBe('pending');
    expect(revRes.data.previewDiff).toBeDefined();

    // 7. Invalid op in studio_propose_revision returns isError without persisting
    const badRevRes = parseToolPayload(session.responses.get(9));
    expect(badRevRes.isError).toBe(true);

    // 8. Verify atomic disk state: reply + 1 pending revision persisted, human draft & specs untouched, no leftover tmp files
    const reloaded = readStudioState(makeNodeStudioStateIo(repo.root), 'negotiate-1');
    expect(reloaded.comments.find((c) => c.id === 'c1')?.status).toBe('resolved');
    expect(reloaded.comments.some((c) => c.replyTo === 'c1' && c.author === 'agent')).toBe(true);
    expect(reloaded.revisions).toHaveLength(1);
    expect(reloaded.revisions[0]?.status).toBe('pending');
    expect(JSON.stringify(reloaded.machines[machineKey]!.current)).toBe(humanCurrentBefore);
    expect(readFileSync(specPath, 'utf8')).toBe(specBefore);

    const stateFiles = readdirSync(join(repo.root, STUDIO_STATES_REL));
    expect(stateFiles).toEqual(['negotiate-1.json']);
  } finally {
    repo.cleanup();
  }
});

test('T4: stdio stdout emits ONLY valid JSON-RPC frames even when legacy config WARNING fires', async () => {
  const repo = makeTempRepo({ legacyBddConfig: true });
  try {
    seedDraft(repo.root, 'legacy-check');
    const session = await runStdioMcpSession(
      repo.root,
      [],
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'purity-check', version: '1.0.0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'studio_list_states', arguments: {} },
        },
      ],
    );

    expect(session.code).toBe(0);

    const nonEmptyLines = session.rawStdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    expect(nonEmptyLines.length).toBeGreaterThanOrEqual(2);

    for (const line of nonEmptyLines) {
      const frame = JSON.parse(line) as { jsonrpc?: string };
      expect(frame.jsonrpc).toBe('2.0');
      expect(line).not.toContain('WARNING');
    }

    expect(session.stderr).toContain('[WARNING]');
    expect(session.stderr).toContain('specs.check_command');
  } finally {
    repo.cleanup();
  }
});

test('T3: concurrent MCP write-back calls keep state JSON atomic with zero leftover temp files', async () => {
  const repo = makeTempRepo();
  try {
    const seeded = seedDraft(repo.root, 'concurrent-1', { withComment: true });
    const machineKey = Object.keys(seeded.machines)[0]!;
    const humanCurrentBefore = JSON.stringify(seeded.machines[machineKey]!.current);

    // Fire 4 concurrent write-back calls in two parallel MCP stdio processes targeting the same state file.
    const [sessionA, sessionB] = await Promise.all([
      runStdioMcpSession(
        repo.root,
        [],
        [
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-03-26',
              capabilities: {},
              clientInfo: { name: 'worker-a', version: '1.0.0' },
            },
          },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'studio_reply_comment',
              arguments: { stateId: 'concurrent-1', commentId: 'c1', body: 'reply from A' },
            },
          },
        ],
      ),
      runStdioMcpSession(
        repo.root,
        [],
        [
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-03-26',
              capabilities: {},
              clientInfo: { name: 'worker-b', version: '1.0.0' },
            },
          },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'studio_propose_revision',
              arguments: {
                stateId: 'concurrent-1',
                machineKey,
                rationale: 'add audit state from B',
                ops: [{ op: 'add_state', name: '审计复核' }],
              },
            },
          },
        ],
      ),
    ]);

    expect(sessionA.code).toBe(0);
    expect(sessionB.code).toBe(0);
    expect(parseToolPayload(sessionA.responses.get(2)).isError).toBe(false);
    expect(parseToolPayload(sessionB.responses.get(2)).isError).toBe(false);

    // Atomic rename guarantees the resulting file on disk is always valid schema-compliant JSON with zero .tmp leftovers.
    const files = readdirSync(join(repo.root, STUDIO_STATES_REL));
    expect(files).toEqual(['concurrent-1.json']);
    const finalDoc = readStudioState(makeNodeStudioStateIo(repo.root), 'concurrent-1');
    expect(finalDoc.id).toBe('concurrent-1');
    expect(JSON.stringify(finalDoc.machines[machineKey]!.current)).toBe(humanCurrentBefore);
  } finally {
    repo.cleanup();
  }
});
