// BDD acceptance steps for llmanspec/specs/studio-mcp.feature (r139-r142).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

import { makeNodeStudioStateIo } from '../../../apps/cli/src/commands/studio.ts';
import { STUDIO_MCP_TOOL_NAMES } from '../../../apps/cli/src/commands/studioMcp.ts';
import { initGitRepo } from '../../helpers/spawn.ts';
import { bdd } from '../runner.ts';
import { CLI } from './shared.ts';

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

function runCliIn(args: string[], cwd: string): CliResult {
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, ...args], { cwd, encoding: 'utf8', env });
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

async function runStdioSession(
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
      rejectAll(new Error(`studio mcp stdio timeout\nstdout=${rawStdout}\nstderr=${stderr}`));
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
            // Keep rawStdout intact for strict frame assertions.
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

function parseToolResult(resp: JsonRpcResponse | undefined): {
  isError: boolean;
  data: Record<string, unknown>;
} {
  if (!resp || !resp.result) {
    throw new Error(`missing JSON-RPC result: ${JSON.stringify(resp)}`);
  }
  const content = resp.result.content as Array<{ type: string; text: string }> | undefined;
  return {
    isError: resp.result.isError === true,
    data: JSON.parse(content?.[0]?.text ?? '{}') as Record<string, unknown>,
  };
}

const EXPENSE_FEATURE = `# language: zh-CN
# purpose: 定义 expense 能力的状态流转与行为合约。

功能: expense

  @req:r10
  规则: 报销状态流转
    报销单 MUST 按状态流转表推进。

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

function makeTempMcpRepo(opts: { legacyBdd?: boolean } = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-studio-mcp-')));
  initGitRepo(root, 'main');
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  const cfg = opts.legacyBdd
    ? 'schema: spec-driven\nlocale: zh-Hans\nbdd:\n  run_command: "bun test tests/bdd"\n'
    : 'schema: spec-driven\nlocale: zh-Hans\n';
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), cfg);
  writeFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), EXPENSE_FEATURE);
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'init'], { cwd: root });
  return root;
}

function seedMcpDraft(
  root: string,
  id: string,
  opts: { withComment?: boolean; brokenE3?: boolean } = {},
): StudioStateDoc {
  const entry: SpecEntry = {
    fileName: 'llmanspec/specs/expense.feature',
    specId: 'expense',
    doc: parseCapability(EXPENSE_FEATURE, 'llmanspec/specs/expense.feature'),
  };
  const draft = extractStudioMachines([entry])[0]!.draft;
  draft.current!.states[1]!.name = '主管审批';
  if (opts.brokenE3) {
    draft.current!.states.push({ uid: 's99', name: '孤岛状态' });
  }
  let doc = createStudioStateDoc({
    id,
    title: `MCP ${id}`,
    createdAt: '2026-11-26T12:00:00Z',
    drafts: [draft],
  });
  if (opts.withComment) {
    doc = addStudioComment(doc, {
      anchor: { kind: 'state', machineKey: draft.current!.machineKey, stateUid: 's2' },
      author: 'human',
      body: '请核对主管审批节点',
      createdAt: '2026-11-26T12:01:00Z',
    });
  }
  writeStudioState(makeNodeStudioStateIo(root), doc);
  return doc;
}

const INIT_MESSAGES: Array<Record<string, unknown>> = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'bdd-client', version: '1.0.0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
];

// --- r139 ---
bdd.when(
  '依次运行 studio mcp --print-config 的 4 类合法 client、非法 client 与 --transport http',
  (ctx) => {
    const cwd = process.cwd();
    const claude = runCliIn(['studio', 'mcp', '--print-config', 'claude-code'], cwd);
    const cursor = runCliIn(['studio', 'mcp', '--print-config', 'cursor'], cwd);
    const codex = runCliIn(['studio', 'mcp', '--print-config', 'codex'], cwd);
    const generic = runCliIn(['studio', 'mcp', '--print-config', 'generic'], cwd);
    const invalid = runCliIn(['studio', 'mcp', '--print-config', 'bad-client'], cwd);
    const http = runCliIn(['studio', 'mcp', '--transport', 'http'], cwd);
    ctx.fixtures['r139Out'] = { claude, cursor, codex, generic, invalid, http };
  },
);

bdd.thenStep('4 类合法 client 均输出有效配置且退出码为 0', (ctx) => {
  const { claude, cursor, codex, generic } = ctx.fixtures['r139Out'] as Record<string, CliResult>;
  for (const res of [claude!, cursor!, generic!]) {
    if (res.code !== 0) throw new Error(`expected exit 0, got ${res.code}: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout) as { mcpServers?: Record<string, unknown> };
    if (!parsed.mcpServers?.['llman-sdd-studio']) {
      throw new Error(`missing llman-sdd-studio config: ${res.stdout}`);
    }
  }
  if (codex!.code !== 0 || !codex!.stdout.includes('[mcp_servers.llman-sdd-studio]')) {
    throw new Error(`unexpected codex config: code=${codex!.code} out=${codex!.stdout}`);
  }
});

bdd.thenStep('非法 client 退出码为 2', (ctx) => {
  const { invalid } = ctx.fixtures['r139Out'] as { invalid: CliResult };
  if (invalid.code !== 2) {
    throw new Error(`expected exit 2 for invalid client, got ${invalid.code}: ${invalid.stderr}`);
  }
});

bdd.thenStep('--transport http 退出码为 1 且 stderr 含未实现提示', (ctx) => {
  const { http } = ctx.fixtures['r139Out'] as { http: CliResult };
  if (http.code !== 1 || !http.stderr.includes('not yet implemented')) {
    throw new Error(`unexpected --transport http result: code=${http.code} stderr=${http.stderr}`);
  }
});

// --- r140 ---
bdd.given('一个含 Studio 本地草稿并可扩展第二链接 worktree 的临时 git 仓库', (ctx) => {
  const root = makeTempMcpRepo();
  seedMcpDraft(root, 'main-draft');
  ctx.fixtures['r140Root'] = root;
});

bdd.when(
  '通过 studio mcp 在单 worktree 省略 directory、挂载第二 worktree 后省略 directory 与显式传目标 directory 分别调用 studio_list_states',
  async (ctx) => {
    const root = ctx.fixtures['r140Root'] as string;
    const singleSession = await runStdioSession(
      root,
      [],
      [
        ...INIT_MESSAGES,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'studio_list_states', arguments: {} },
        },
      ],
    );

    const wtBase = realpathSync(mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-wt-')));
    const wt2 = join(wtBase, 'linked-wt');
    const addRes = spawnSync('git', ['worktree', 'add', '-qb', 'feat/mcp-wt2', wt2], {
      cwd: root,
      encoding: 'utf8',
    });
    if (addRes.status !== 0) {
      throw new Error(`git worktree add failed: ${addRes.stderr}`);
    }
    const wt2Real = realpathSync(wt2);
    seedMcpDraft(wt2Real, 'wt2-draft');

    const multiSession = await runStdioSession(
      root,
      [],
      [
        ...INIT_MESSAGES,
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'studio_list_states', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'studio_list_states', arguments: { directory: wt2Real } },
        },
      ],
    );

    ctx.fixtures['r140Out'] = { root, wt2Real, singleSession, multiSession };
  },
);

bdd.thenStep('单 worktree 省略 directory 成功返回草稿列表并回显 instanceRoot 与 branch', (ctx) => {
  const { root, singleSession } = ctx.fixtures['r140Out'] as {
    root: string;
    singleSession: { responses: Map<number, JsonRpcResponse> };
  };
  const res = parseToolResult(singleSession.responses.get(2));
  if (
    res.isError ||
    res.data.instanceRoot !== root ||
    res.data.branch !== 'main' ||
    (res.data.states as Array<{ id: string }>)[0]?.id !== 'main-draft'
  ) {
    throw new Error(`unexpected single-worktree result: ${JSON.stringify(res)}`);
  }
});

bdd.thenStep('多 worktree 省略 directory 被程序级拦截且错误信息列出全部 worktree 路径', (ctx) => {
  const { root, wt2Real, multiSession } = ctx.fixtures['r140Out'] as {
    root: string;
    wt2Real: string;
    multiSession: { responses: Map<number, JsonRpcResponse> };
  };
  const res = parseToolResult(multiSession.responses.get(2));
  const msg = String(res.data.message ?? '');
  if (!res.isError || !msg.includes(root) || !msg.includes(wt2Real)) {
    throw new Error(
      `expected multi-worktree error listing both paths, got: ${JSON.stringify(res)}`,
    );
  }
});

bdd.thenStep('显式传入目标 worktree directory 后精准命中目标仓草稿', (ctx) => {
  const { wt2Real, multiSession } = ctx.fixtures['r140Out'] as {
    wt2Real: string;
    multiSession: { responses: Map<number, JsonRpcResponse> };
  };
  const res = parseToolResult(multiSession.responses.get(3));
  const ids = (res.data.states as Array<{ id: string }>).map((s) => s.id);
  if (
    res.isError ||
    res.data.instanceRoot !== wt2Real ||
    res.data.branch !== 'feat/mcp-wt2' ||
    ids.join(',') !== 'wt2-draft'
  ) {
    throw new Error(`unexpected explicit-directory result: ${JSON.stringify(res)}`);
  }
});

// --- r141 ---
bdd.given('一个含状态机修改草稿与待回复评论的临时 git 仓库', (ctx) => {
  const root = makeTempMcpRepo();
  const doc = seedMcpDraft(root, 'flow-1', { withComment: true, brokenE3: true });
  const machineKey = Object.keys(doc.machines)[0]!;
  ctx.fixtures['r141State'] = {
    root,
    machineKey,
    beforeCurrent: JSON.stringify(doc.machines[machineKey]!.current),
    beforeSpec: readFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), 'utf8'),
    beforeStateDisk: readFileSync(join(root, STUDIO_STATES_REL, 'flow-1.json'), 'utf8'),
  };
});

bdd.when('通过 stdio JSON-RPC 依次调用 tools/list 与全部 5 个 Studio MCP 工具', async (ctx) => {
  const { root, machineKey } = ctx.fixtures['r141State'] as { root: string; machineKey: string };
  const readOnlySession = await runStdioSession(
    root,
    [],
    [
      ...INIT_MESSAGES,
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
        params: {
          name: 'studio_validate_draft',
          arguments: { patchOps: [{ op: 'remove_state', stateName: '孤岛状态' }] },
        },
      },
    ],
  );

  const diskAfterReadOnly = readFileSync(join(root, STUDIO_STATES_REL, 'flow-1.json'), 'utf8');

  const writeSession = await runStdioSession(
    root,
    [],
    [
      ...INIT_MESSAGES,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'studio_reply_comment',
          arguments: { stateId: 'flow-1', commentId: 'c1', body: '已确认节点名', resolve: true },
        },
      },
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'studio_propose_revision',
          arguments: {
            stateId: 'flow-1',
            machineKey,
            rationale: '移除孤岛状态',
            ops: [{ op: 'remove_state', stateName: '孤岛状态' }],
          },
        },
      },
    ],
  );

  const reloaded = readStudioState(makeNodeStudioStateIo(root), 'flow-1');
  const afterSpec = readFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), 'utf8');
  ctx.fixtures['r141Out'] = {
    readOnlySession,
    diskAfterReadOnly,
    writeSession,
    reloaded,
    afterSpec,
  };
});

bdd.thenStep('tools/list 恰好暴露 5 个核心工具且无任何直写 specs 工具', (ctx) => {
  const { readOnlySession } = ctx.fixtures['r141Out'] as {
    readOnlySession: { responses: Map<number, JsonRpcResponse> };
  };
  const tools = (readOnlySession.responses.get(2)?.result?.tools as Array<{ name: string }>) ?? [];
  const names = tools.map((t) => t.name).toSorted();
  const expected = [...STUDIO_MCP_TOOL_NAMES].toSorted();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`unexpected MCP tools: ${JSON.stringify(names)}`);
  }
});

bdd.thenStep('只读工具返回语义 Diff、评论与带 patchOps 预检结果且不改写磁盘草稿', (ctx) => {
  const { beforeStateDisk } = ctx.fixtures['r141State'] as { beforeStateDisk: string };
  const { readOnlySession, diskAfterReadOnly } = ctx.fixtures['r141Out'] as {
    readOnlySession: { responses: Map<number, JsonRpcResponse> };
    diskAfterReadOnly: string;
  };
  const diffRes = parseToolResult(readOnlySession.responses.get(4));
  const valRes = parseToolResult(readOnlySession.responses.get(5));
  if (diffRes.isError || (diffRes.data.comments as unknown[]).length !== 1) {
    throw new Error(`unexpected studio_get_diff: ${JSON.stringify(diffRes)}`);
  }
  if (valRes.isError || valRes.data.ok !== true || valRes.data.patched !== true) {
    throw new Error(`unexpected studio_validate_draft: ${JSON.stringify(valRes)}`);
  }
  if (diskAfterReadOnly !== beforeStateDisk) {
    throw new Error('read-only MCP tools mutated disk state file');
  }
});

bdd.thenStep(
  '写回工具原子持久化评论回复与 pending 修订建议且人类草稿与 specs 文件零改动',
  (ctx) => {
    const { machineKey, beforeCurrent, beforeSpec } = ctx.fixtures['r141State'] as {
      machineKey: string;
      beforeCurrent: string;
      beforeSpec: string;
    };
    const { writeSession, reloaded, afterSpec } = ctx.fixtures['r141Out'] as {
      writeSession: { responses: Map<number, JsonRpcResponse> };
      reloaded: StudioStateDoc;
      afterSpec: string;
    };
    const replyRes = parseToolResult(writeSession.responses.get(6));
    const revRes = parseToolResult(writeSession.responses.get(7));
    const writeFailed = replyRes.isError || revRes.isError;
    if (writeFailed) {
      throw new Error(`write-back MCP tool failed: ${JSON.stringify({ replyRes, revRes })}`);
    }
    if (
      reloaded.comments.find((c) => c.id === 'c1')?.status !== 'resolved' ||
      !reloaded.comments.some((c) => c.replyTo === 'c1' && c.author === 'agent')
    ) {
      throw new Error(`comment reply not persisted: ${JSON.stringify(reloaded.comments)}`);
    }
    if (reloaded.revisions.length !== 1 || reloaded.revisions[0]?.status !== 'pending') {
      throw new Error(`revision not persisted as pending: ${JSON.stringify(reloaded.revisions)}`);
    }
    if (JSON.stringify(reloaded.machines[machineKey]!.current) !== beforeCurrent) {
      throw new Error('studio_propose_revision mutated human draft current graph');
    }
    if (afterSpec !== beforeSpec) {
      throw new Error('MCP tools unexpectedly modified llmanspec/specs/expense.feature');
    }
  },
);

// --- r142 ---
bdd.given('一个含 legacy bdd 配置与 Studio 草稿的临时 git 仓库', (ctx) => {
  const root = makeTempMcpRepo({ legacyBdd: true });
  seedMcpDraft(root, 'legacy-1');
  ctx.fixtures['r142Root'] = root;
});

bdd.when('启动 studio mcp 并经 stdio 收发 initialize 与 studio_list_states 请求', async (ctx) => {
  const root = ctx.fixtures['r142Root'] as string;
  const session = await runStdioSession(
    root,
    [],
    [
      ...INIT_MESSAGES,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'studio_list_states', arguments: {} },
      },
    ],
  );
  ctx.fixtures['r142Out'] = session;
});

bdd.thenStep('stdout 每一非空行均为合法 JSON-RPC 帧且不含 WARNING 文本', (ctx) => {
  const session = ctx.fixtures['r142Out'] as { code: number; rawStdout: string };
  if (session.code !== 0) {
    throw new Error(`studio mcp exited with code ${session.code}`);
  }
  const lines = session.rawStdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length < 2) {
    throw new Error(`expected at least 2 JSON-RPC response lines, got: ${session.rawStdout}`);
  }
  for (const line of lines) {
    const parsed = JSON.parse(line) as { jsonrpc?: string };
    if (parsed.jsonrpc !== '2.0' || line.includes('WARNING')) {
      throw new Error(`stdout polluted by non-JSON-RPC line: ${line}`);
    }
  }
});

bdd.thenStep('legacy 配置 WARNING 仅出现在 stderr', (ctx) => {
  const session = ctx.fixtures['r142Out'] as { stderr: string };
  if (!session.stderr.includes('[WARNING]') || !session.stderr.includes('specs.check_command')) {
    throw new Error(`expected legacy bdd WARNING on stderr, got: ${session.stderr}`);
  }
});
