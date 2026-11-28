/**
 * Thin Studio MCP bridge (`llman-sdd studio mcp`, studio-mcp r139-r142).
 * Zero domain logic duplication: delegates all graph validation, semantic diff,
 * revision preview/proposal, comment reply, and atomic state I/O directly to
 * `@llman-sdd/core` and C2 `makeNodeStudioStateIo`.
 *
 * Transport discipline: when serving over stdio, stdout carries ONLY JSON-RPC
 * frames; all warnings, diagnostics, and out-of-band errors write strictly to stderr.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyRevisionOpsToMachine,
  cloneMachineDraft,
  computeMachineDiff,
  currentBranch,
  formatSemanticDiff,
  hasBlockingDiagnostics,
  listStudioStates,
  previewFeatureUnifiedDiff,
  previewRevisionProposal,
  proposeRevision,
  readStudioState,
  renderUpdatedFeatureSource,
  replyStudioComment,
  resolveInstanceRoot,
  StudioSyncError,
  validateMachineGraph,
  validateStateId,
  worktreeList,
  writeStudioState,
  type MachineDiagnostic,
  type MachineDraft,
  type RevisionOp,
  type StudioStateIo,
  type WorktreeEntry,
} from '@llman-sdd/core';
import type { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Command } from 'commander';

import {
  addSpecDirOption,
  CliError,
  loadCliConfig,
  version,
  type CliContext,
} from '../cli-shared.ts';
import { makeCliGit, makeIo } from '../io.ts';
import { makeNodeStudioStateIo, resolveStateIdOrThrow } from './studioShared.ts';

/**
 * Lazy helper for in-memory transport tests under `tests/` without eagerly loading
 * `@modelcontextprotocol/server` on every CLI startup.
 */
export async function createLinkedMcpTransports(): Promise<[InMemoryTransport, InMemoryTransport]> {
  const { InMemoryTransport: TransportCtor } = await import('@modelcontextprotocol/server');
  return TransportCtor.createLinkedPair();
}

export const MCP_PRINT_CONFIG_CLIENTS = ['claude-code', 'cursor', 'codex', 'generic'] as const;
export type McpPrintConfigClient = (typeof MCP_PRINT_CONFIG_CLIENTS)[number];

export const STUDIO_MCP_TOOL_NAMES = [
  'studio_list_states',
  'studio_get_diff',
  'studio_validate_draft',
  'studio_reply_comment',
  'studio_propose_revision',
] as const;

export function isMcpPrintConfigClient(value: string): value is McpPrintConfigClient {
  return (MCP_PRINT_CONFIG_CLIENTS as readonly string[]).includes(value);
}

/**
 * Render a ready-to-paste MCP client configuration snippet for `llman-sdd studio mcp`.
 */
export function renderMcpClientConfig(client: McpPrintConfigClient, directory?: string): string {
  const args =
    directory !== undefined && directory.trim() !== ''
      ? ['studio', 'mcp', '--directory', directory.trim()]
      : ['studio', 'mcp'];

  if (client === 'codex') {
    const serializedArgs = args.map((arg) => JSON.stringify(arg)).join(', ');
    return [
      '[mcp_servers.llman-sdd-studio]',
      'command = "llman-sdd"',
      `args = [${serializedArgs}]`,
    ].join('\n');
  }

  return JSON.stringify(
    {
      mcpServers: {
        'llman-sdd-studio': {
          command: 'llman-sdd',
          args,
        },
      },
    },
    null,
    2,
  );
}

export class McpToolError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
    this.details = details;
  }
}

export interface McpRootDefaults {
  /** Explicitly pinned via CLI `--directory <path>` at launch (exempts multi-worktree prompt). */
  pinnedDirectory?: string;
  /** Unique client-declared root path resolved from MCP `roots/list` (when advertised). */
  clientRoot?: string;
  /** Process launch working directory. */
  cwd: string;
}

export interface ResolvedMcpContext {
  instanceRoot: string;
  branch: string | null;
  io: ReturnType<typeof makeIo>;
  studioIo: StudioStateIo;
  git: ReturnType<typeof makeCliGit>;
}

function surfaceLegacyConfigWarningsToStderr(instanceRoot: string): void {
  try {
    loadCliConfig(instanceRoot);
  } catch (error) {
    console.error(
      `[WARNING] failed to load llmanspec/config.yaml under ${instanceRoot}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Adaptive multi-worktree instance root resolver (design D3, studio-mcp r140):
 * 1. Explicit `inputDirectory` -> direct `resolveInstanceRoot`.
 * 2. Omitted `inputDirectory` -> `pinnedDirectory` > unique `clientRoot` > `cwd`.
 *    When NOT pinned via `--directory` and `worktreeList()` reports >1 valid worktree,
 *    rejects with a structured error listing all available worktree paths.
 */
export function resolveMcpInstanceRoot(
  inputDirectory: string | undefined,
  defaults: McpRootDefaults,
): ResolvedMcpContext {
  const trimmedInput = inputDirectory?.trim();
  const hasExplicitInput = trimmedInput !== undefined && trimmedInput !== '';

  let startPath: string;
  let displayStart: string;
  let isPinned = false;

  if (hasExplicitInput) {
    displayStart = trimmedInput;
    startPath = resolve(defaults.cwd, trimmedInput);
  } else if (defaults.pinnedDirectory !== undefined && defaults.pinnedDirectory.trim() !== '') {
    displayStart = defaults.pinnedDirectory.trim();
    startPath = resolve(defaults.cwd, displayStart);
    isPinned = true;
  } else if (defaults.clientRoot !== undefined && defaults.clientRoot.trim() !== '') {
    displayStart = defaults.clientRoot.trim();
    startPath = resolve(defaults.cwd, displayStart);
  } else {
    displayStart = defaults.cwd;
    startPath = resolve(defaults.cwd);
  }

  const root = resolveInstanceRoot(startPath, makeIo(startPath));
  if (root === null) {
    throw new McpToolError('no_llmanspec_root', `no llmanspec root at or above: ${displayStart}`);
  }

  const instanceRoot = resolve(root);
  const git = makeCliGit(instanceRoot);

  if (!hasExplicitInput && !isPinned) {
    let validWorktrees: WorktreeEntry[] = [];
    try {
      validWorktrees = worktreeList(git).filter((entry) => !entry.prunable);
    } catch {
      // Non-git directory or git worktree probe failure -> treat as single repository.
      validWorktrees = [];
    }

    if (validWorktrees.length > 1) {
      const worktreeSummaries = validWorktrees.map((w) => ({
        path: w.path,
        branch: w.branch,
      }));
      const pathList = validWorktrees
        .map((w) => (w.branch ? `${w.path} (${w.branch})` : w.path))
        .join(', ');
      throw new McpToolError(
        'multiple_worktrees_detected',
        `multiple git worktrees detected (${String(validWorktrees.length)}): ${pathList}. Pass the target worktree path explicitly in the 'directory' parameter or pin '--directory' at server launch.`,
        {
          worktrees: worktreeSummaries,
          hint: 'Specify `directory` in tool arguments or start `llman-sdd studio mcp --directory <path>`.',
        },
      );
    }
  }

  surfaceLegacyConfigWarningsToStderr(instanceRoot);

  return {
    instanceRoot,
    branch: currentBranch(git),
    io: makeIo(instanceRoot),
    studioIo: makeNodeStudioStateIo(instanceRoot),
    git,
  };
}

function okToolResult(payload: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

function errorToolResult(error: unknown): {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
} {
  if (error instanceof McpToolError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.code,
              message: error.message,
              ...error.details,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: 'tool_error', message }, null, 2),
      },
    ],
  };
}

async function resolveUniqueClientRoot(server: McpServer): Promise<string | undefined> {
  try {
    const caps = server.server.getClientCapabilities();
    if (caps?.roots === undefined) return undefined;
    const listed = await server.server.listRoots(undefined, { timeout: 2000 });
    const filePaths: string[] = [];
    for (const root of listed.roots) {
      if (root.uri.startsWith('file://')) {
        try {
          filePaths.push(fileURLToPath(root.uri));
        } catch {
          // Ignore malformed file:// URIs.
        }
      }
    }
    return filePaths.length === 1 ? filePaths[0] : undefined;
  } catch {
    return undefined;
  }
}

export interface StudioMcpServerOptions {
  /** Launch working directory (`ctx.cwd`). */
  cwd: string;
  /** Optional launch-pinned `--directory <path>`. */
  pinnedDirectory?: string;
}

/**
 * Construct a fresh `McpServer` registering ONLY the 5 negotiation tools
 * (`studio_list_states`, `studio_get_diff`, `studio_validate_draft`,
 * `studio_reply_comment`, `studio_propose_revision`) — zero direct spec-write tools.
 */
export async function createStudioMcpServer(options: StudioMcpServerOptions): Promise<McpServer> {
  const [{ McpServer: McpServerCtor }, { z }] = await Promise.all([
    import('@modelcontextprotocol/server'),
    import('zod'),
  ]);

  const revisionOpSchema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('add_state'), name: z.string().min(1) }),
    z.object({ op: z.literal('remove_state'), stateName: z.string().min(1) }),
    z.object({ op: z.literal('rename_state'), from: z.string().min(1), to: z.string().min(1) }),
    z.object({
      op: z.literal('add_transition'),
      from: z.string().min(1),
      event: z.string().min(1),
      guard: z.string().optional(),
      to: z.string().min(1),
    }),
    z.object({
      op: z.literal('remove_transition'),
      from: z.string().min(1),
      event: z.string().min(1),
      guard: z.string().optional(),
      to: z.string().min(1),
    }),
    z.object({
      op: z.literal('update_transition'),
      match: z.object({
        from: z.string().min(1),
        event: z.string().min(1),
        guard: z.string().optional(),
        to: z.string().min(1),
      }),
      next: z.object({
        from: z.string().min(1).optional(),
        event: z.string().min(1).optional(),
        guard: z.string().optional(),
        to: z.string().min(1).optional(),
      }),
    }),
  ]);

  const mcpServer = new McpServerCtor(
    {
      name: 'llman-sdd-studio',
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const resolveContext = async (inputDirectory?: string): Promise<ResolvedMcpContext> => {
    const needsClientRoot =
      (inputDirectory === undefined || inputDirectory.trim() === '') &&
      (options.pinnedDirectory === undefined || options.pinnedDirectory.trim() === '');
    const clientRoot = needsClientRoot ? await resolveUniqueClientRoot(mcpServer) : undefined;
    return resolveMcpInstanceRoot(inputDirectory, {
      cwd: options.cwd,
      pinnedDirectory: options.pinnedDirectory,
      clientRoot,
    });
  };

  // 1. studio_list_states
  mcpServer.registerTool(
    'studio_list_states',
    {
      title: 'List Studio Draft States',
      description:
        'List local Studio draft state files under .llman-sdd/studio/states/ for the target workspace.',
      inputSchema: z.object({
        directory: z
          .string()
          .optional()
          .describe(
            'Target workspace or git worktree path (required when multiple worktrees exist and --directory was not pinned).',
          ),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ directory }) => {
      try {
        const resolved = await resolveContext(directory);
        const states = listStudioStates(resolved.studioIo);
        return okToolResult({
          instanceRoot: resolved.instanceRoot,
          branch: resolved.branch,
          states,
        });
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  // 2. studio_get_diff
  mcpServer.registerTool(
    'studio_get_diff',
    {
      title: 'Get Studio Draft Diff',
      description:
        'Inspect semantic diffs, comments, pending revisions, and optional in-memory Unified Diff preview for a Studio draft.',
      inputSchema: z.object({
        stateId: z
          .string()
          .optional()
          .describe('Studio draft state ID (auto-selected when exactly one draft exists).'),
        includeUnified: z
          .boolean()
          .optional()
          .describe('Include in-memory Unified Diff preview for changed machines (default: true).'),
        directory: z.string().optional().describe('Target workspace or git worktree path.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ stateId, includeUnified, directory }) => {
      try {
        const resolved = await resolveContext(directory);
        const targetId = resolveStateIdOrThrow(resolved.studioIo, stateId);
        const doc = readStudioState(resolved.studioIo, targetId);
        const wantUnified = includeUnified !== false;

        const semanticDiff: Record<
          string,
          {
            mode: MachineDraft['mode'];
            sourceFile: string;
            hasChanges: boolean;
            diff: ReturnType<typeof computeMachineDiff>;
            summary: string;
          }
        > = {};
        const unifiedDiff: Record<string, string | null> = {};
        const unifiedDiffErrors: Record<string, string> = {};

        for (const [machineKey, draft] of Object.entries(doc.machines)) {
          const diff = computeMachineDiff(draft);
          const summary = formatSemanticDiff(diff, draft);
          semanticDiff[machineKey] = {
            mode: draft.mode,
            sourceFile: draft.sourceFile,
            hasChanges: diff.hasChanges,
            diff,
            summary,
          };

          if (wantUnified) {
            if (diff.hasChanges) {
              try {
                const beforeText = resolved.io.exists(draft.sourceFile)
                  ? resolved.io.readText(draft.sourceFile)
                  : null;
                const afterText = renderUpdatedFeatureSource(beforeText, draft);
                unifiedDiff[machineKey] = previewFeatureUnifiedDiff(
                  draft.sourceFile,
                  beforeText,
                  afterText,
                );
              } catch (error) {
                if (error instanceof StudioSyncError) {
                  unifiedDiff[machineKey] = null;
                  unifiedDiffErrors[machineKey] = error.message;
                } else {
                  throw error;
                }
              }
            } else {
              unifiedDiff[machineKey] = null;
            }
          }
        }

        return okToolResult({
          instanceRoot: resolved.instanceRoot,
          branch: resolved.branch,
          stateId: doc.id,
          title: doc.title,
          updatedAt: doc.updatedAt,
          semanticDiff,
          comments: doc.comments,
          openComments: doc.comments.filter((c) => c.status === 'open'),
          pendingRevisions: doc.revisions.filter((r) => r.status === 'pending'),
          ...(wantUnified ? { unifiedDiff } : {}),
          ...(Object.keys(unifiedDiffErrors).length > 0 ? { unifiedDiffErrors } : {}),
        });
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  // 3. studio_validate_draft
  mcpServer.registerTool(
    'studio_validate_draft',
    {
      title: 'Validate Studio Draft',
      description:
        'Run E1-E4/W1-W2 state-machine graph validation on a Studio draft, optionally pre-validating hypothetical patchOps in memory without writing to disk.',
      inputSchema: z.object({
        stateId: z
          .string()
          .optional()
          .describe('Studio draft state ID (auto-selected when exactly one draft exists).'),
        machineKey: z
          .string()
          .optional()
          .describe('Target machine key when applying patchOps to a multi-machine draft.'),
        patchOps: z
          .array(revisionOpSchema)
          .optional()
          .describe(
            'Optional RevisionOp[] applied only in memory before validation (never mutates disk).',
          ),
        directory: z.string().optional().describe('Target workspace or git worktree path.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ stateId, machineKey, patchOps, directory }) => {
      try {
        const resolved = await resolveContext(directory);
        const targetId = resolveStateIdOrThrow(resolved.studioIo, stateId);
        const doc = readStudioState(resolved.studioIo, targetId);

        const workingMachines: Record<string, MachineDraft> = {};
        for (const [k, d] of Object.entries(doc.machines)) {
          workingMachines[k] = cloneMachineDraft(d);
        }

        const hasPatch = patchOps !== undefined && patchOps.length > 0;
        if (hasPatch) {
          const keys = Object.keys(workingMachines);
          let targetKey = machineKey?.trim();
          if (!targetKey) {
            if (keys.length === 1) {
              targetKey = keys[0]!;
            } else if (keys.length === 0) {
              throw new McpToolError(
                'no_machines',
                `studio state '${doc.id}' contains no machines`,
              );
            } else {
              throw new McpToolError(
                'ambiguous_machine',
                `multiple machines in state '${doc.id}' (${keys.join(', ')}); specify machineKey alongside patchOps`,
              );
            }
          }
          const targetDraft = workingMachines[targetKey];
          if (!targetDraft || !targetDraft.current) {
            throw new McpToolError(
              'machine_not_found',
              `cannot patch machine without current graph: ${targetKey}`,
            );
          }
          targetDraft.current = applyRevisionOpsToMachine(
            targetDraft.current,
            patchOps as RevisionOp[],
          );
        }

        const diagnostics: Array<MachineDiagnostic & { machineKey: string }> = [];
        const machines: Array<{
          machineKey: string;
          mode: MachineDraft['mode'];
          sourceFile: string;
          valid: boolean;
          diagnostics: MachineDiagnostic[];
        }> = [];
        let errorCount = 0;
        let warningCount = 0;

        for (const [mKey, draft] of Object.entries(workingMachines)) {
          if (draft.mode === 'remove') {
            machines.push({
              machineKey: mKey,
              mode: draft.mode,
              sourceFile: draft.sourceFile,
              valid: true,
              diagnostics: [],
            });
            continue;
          }
          const diags: MachineDiagnostic[] = draft.current
            ? validateMachineGraph(draft.current)
            : [
                {
                  code: 'E1',
                  severity: 'error',
                  targetKind: 'machine',
                  targetId: null,
                  message: 'E1 structure: machine draft has no current graph',
                },
              ];
          for (const d of diags) {
            if (d.severity === 'error') errorCount += 1;
            else warningCount += 1;
            diagnostics.push({ ...d, machineKey: mKey });
          }
          machines.push({
            machineKey: mKey,
            mode: draft.mode,
            sourceFile: draft.sourceFile,
            valid: !hasBlockingDiagnostics(diags),
            diagnostics: diags,
          });
        }

        return okToolResult({
          instanceRoot: resolved.instanceRoot,
          branch: resolved.branch,
          stateId: doc.id,
          ok: errorCount === 0,
          patched: hasPatch,
          errorCount,
          warningCount,
          diagnostics,
          machines,
        });
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  // 4. studio_reply_comment
  mcpServer.registerTool(
    'studio_reply_comment',
    {
      title: 'Reply to Studio Comment',
      description:
        'Atomically append an Agent reply to an anchored comment in a local Studio draft state file (optionally resolving the target comment).',
      inputSchema: z.object({
        stateId: z.string().min(1).describe('Studio draft state ID.'),
        commentId: z.string().min(1).describe('Target comment ID to reply to.'),
        body: z.string().min(1).describe('Reply message text.'),
        resolve: z
          .boolean()
          .optional()
          .describe('Mark the target comment as resolved (default: false).'),
        directory: z.string().optional().describe('Target workspace or git worktree path.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ stateId, commentId, body, resolve: shouldResolve, directory }) => {
      try {
        if (body.trim() === '') {
          throw new McpToolError('invalid_argument', 'body must not be empty');
        }
        const resolved = await resolveContext(directory);
        const targetId = validateStateId(stateId);
        const doc = readStudioState(resolved.studioIo, targetId);
        const nextDoc = replyStudioComment(doc, commentId, {
          author: 'agent',
          body,
          createdAt: resolved.studioIo.now().toISOString(),
          resolve: shouldResolve === true,
        });
        writeStudioState(resolved.studioIo, nextDoc);
        const comment = nextDoc.comments.at(-1)!;
        return okToolResult({
          instanceRoot: resolved.instanceRoot,
          branch: resolved.branch,
          stateId: doc.id,
          resolvedTarget: shouldResolve === true,
          comment,
        });
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  // 5. studio_propose_revision
  mcpServer.registerTool(
    'studio_propose_revision',
    {
      title: 'Propose Studio Revision',
      description:
        'Atomically append a non-destructive pending Agent revision proposal to a Studio draft without mutating human draft graphs or llmanspec/specs/.',
      inputSchema: z.object({
        stateId: z.string().min(1).describe('Studio draft state ID.'),
        machineKey: z.string().min(1).describe('Target machine key in the draft.'),
        rationale: z.string().min(1).describe('Explanation of why the revision is proposed.'),
        ops: z
          .array(revisionOpSchema)
          .min(1)
          .describe('Non-empty list of structured RevisionOp operations.'),
        directory: z.string().optional().describe('Target workspace or git worktree path.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ stateId, machineKey, rationale, ops, directory }) => {
      try {
        if (rationale.trim() === '') {
          throw new McpToolError('invalid_argument', 'rationale must not be empty');
        }
        const resolved = await resolveContext(directory);
        const targetId = validateStateId(stateId);
        const doc = readStudioState(resolved.studioIo, targetId);
        const draft = doc.machines[machineKey];
        if (!draft) {
          throw new McpToolError(
            'machine_not_found',
            `machine not found in state '${doc.id}': ${machineKey}`,
          );
        }

        const nextDoc = proposeRevision(doc, {
          machineKey,
          rationale,
          ops: ops as RevisionOp[],
          createdAt: resolved.studioIo.now().toISOString(),
          source: 'agent',
        });
        const revision = nextDoc.revisions.at(-1)!;
        // Validate & preview ops before persisting so invalid proposals fail cleanly with zero writes.
        const preview = previewRevisionProposal(draft, revision);
        writeStudioState(resolved.studioIo, nextDoc);

        return okToolResult({
          instanceRoot: resolved.instanceRoot,
          branch: resolved.branch,
          stateId: doc.id,
          revision,
          previewDiff: {
            diffFromCurrent: preview.diffFromCurrent,
            diffFromBaseline: preview.diffFromBaseline,
            diagnostics: preview.diagnostics,
          },
        });
      } catch (error) {
        return errorToolResult(error);
      }
    },
  );

  return mcpServer;
}

/**
 * Register `llman-sdd studio mcp` under the `studio` parent command.
 */
export function registerStudioMcp(studioCmd: Command, ctx: CliContext): void {
  const mcpCmd = studioCmd
    .command('mcp')
    .description('Run the Studio MCP server (stdio) or print MCP client configuration')
    .option('--transport <mode>', 'MCP transport mode: stdio (default) | http', 'stdio')
    .option(
      '--print-config [client]',
      'print MCP client configuration snippet (claude-code | cursor | codex | generic) and exit',
    );
  addSpecDirOption(mcpCmd);

  mcpCmd.action(
    async (options: { transport?: string; printConfig?: string | boolean; directory?: string }) => {
      if (options.printConfig !== undefined && options.printConfig !== false) {
        const requested =
          typeof options.printConfig === 'string' ? options.printConfig.trim() : 'generic';
        if (!isMcpPrintConfigClient(requested)) {
          throw new CliError(
            `invalid --print-config client '${requested}' (expected: ${MCP_PRINT_CONFIG_CLIENTS.join(' | ')})`,
            2,
          );
        }
        console.log(renderMcpClientConfig(requested, options.directory));
        return;
      }

      const transportMode = (options.transport ?? 'stdio').trim();
      if (transportMode === 'http') {
        throw new CliError(
          'MCP Streamable HTTP transport (--transport http) is not yet implemented; use --transport stdio',
          1,
        );
      }
      if (transportMode !== 'stdio') {
        throw new CliError(`invalid --transport '${transportMode}' (expected: stdio | http)`, 2);
      }

      // Best-effort startup config warning check strictly on stderr so legacy configs surface early.
      const startupDir =
        options.directory !== undefined ? resolve(ctx.cwd, options.directory) : ctx.cwd;
      const startupRoot = resolveInstanceRoot(startupDir, makeIo(startupDir));
      if (startupRoot !== null) {
        surfaceLegacyConfigWarningsToStderr(resolve(startupRoot));
      }

      const { serveStdio, StdioServerTransport } =
        await import('@modelcontextprotocol/server/stdio');
      const transport = new StdioServerTransport();
      const handle = serveStdio(
        () =>
          createStudioMcpServer({
            cwd: ctx.cwd,
            pinnedDirectory: options.directory,
          }),
        {
          transport,
          onerror: (error) => {
            console.error(`[llman-sdd studio mcp] ${error.message}`);
          },
        },
      );

      await new Promise<void>((resolveDone) => {
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          process.off('SIGINT', onSignal);
          process.off('SIGTERM', onSignal);
          resolveDone();
        };
        const onSignal = (): void => {
          void handle.close().finally(finish);
        };
        const prevOnClose = transport.onclose;
        Object.assign(transport, {
          onclose: () => {
            prevOnClose?.();
            finish();
          },
        });
        process.on('SIGINT', onSignal);
        process.on('SIGTERM', onSignal);
      });
    },
  );
}
