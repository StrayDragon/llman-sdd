/**
 * Context agentic retrieval (context-index capability, r27-r29):
 * OpenAI-compatible /chat/completions with tool calling — three local tools,
 * 12-round cap, then one forced no-tools turn. r28 dedups the model's
 * direct/related classification (direct wins). r29 pins the output contract:
 * quality ∈ {agentic, unavailable}, exhaustion degrades to agentic +
 * truncation note, failures emit summary {totalSpecs:0, error:true}.
 * Env contract mirrors v1: LLMAN_SDD_INDEX_CHAT_MODEL (required) /
 * LLMAN_SDD_INDEX_CHAT_API_HOST|KEY with LLMAN_SDD_INDEX_OPENAI_* fallbacks.
 */
import type { SerializedTreeIndex } from './tree.ts';

export const MAX_TOOL_ROUNDS = 12;

export interface ChatConfig {
  model: string;
  host: string;
  apiKey: string;
}

const envOr = (env: Record<string, string | undefined>, key: string): string | null =>
  env[key]?.trim() || null;

export function resolveChatConfig(env: Record<string, string | undefined>): ChatConfig | null {
  const model = envOr(env, 'LLMAN_SDD_INDEX_CHAT_MODEL');
  if (model === null) return null;
  const host = (
    envOr(env, 'LLMAN_SDD_INDEX_CHAT_API_HOST') ??
    envOr(env, 'LLMAN_SDD_INDEX_OPENAI_API_HOST') ??
    'https://api.openai.com/v1'
  ).replace(/\/$/u, '');
  const apiKey =
    envOr(env, 'LLMAN_SDD_INDEX_CHAT_API_KEY') ??
    envOr(env, 'LLMAN_SDD_INDEX_OPENAI_API_KEY') ??
    '';
  return { model, host, apiKey };
}

export interface TierEntry {
  id: string;
  reason: string;
}

export interface ContextSuccessSummary {
  totalSpecs: number;
  tierDirect: number;
  tierRelated: number;
  unrelatedCount: number;
  toolCalls: number;
  staleWarnings: string[];
  readRecommended: string[];
  paths: string[];
}

/** r29: failures collapse to v1's print_err two-field error summary. */
export interface ContextErrorSummary {
  totalSpecs: 0;
  error: true;
}

export type ContextSummary = ContextSuccessSummary | ContextErrorSummary;

export interface ContextResult {
  status: {
    ok: boolean;
    /** r29: value domain is `agentic` (incl. degraded truncation) | `unavailable`. */
    quality: 'agentic' | 'unavailable';
    qualityNote: string;
    errorKind?: string;
  };
  direct: TierEntry[];
  related: TierEntry[];
  summary: ContextSummary;
}

const SYSTEM_PROMPT = `You are a spec retriever. Given a task, classify which capability specs MUST be read.
1. Call list_specs() to see all available spec documents and their purposes.
2. For specs whose purpose seems relevant to the task, call get_document_structure(spec_id) to see requirements.
3. For requirements that look relevant, call get_spec_content(spec_id, req_ids) to read the requirement text.
Then output ONLY this JSON (no markdown fence):
{\\"direct\\": [{\\"id\\": \\"<spec_id>\\", \\"reason\\": \\"<one sentence why this MUST be read>\\"}], \\"related\\": [{\\"id\\": \\"<spec_id>\\", \\"reason\\": \\"<one sentence>\\"}]}
- "direct" = specs whose behavior contract (any MUST/SHALL statement, command behavior) the task changes or depends on.
- "related" = specs that provide useful context but whose contract won't change.
- If the task changes behavior, the governing spec MUST be in "direct".
- Decide based on the requirement text you read, not on the spec id alone.`;

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'list_specs',
      description: 'List all spec documents with their purposes.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document_structure',
      description: 'List requirement ids and titles of one spec document.',
      parameters: {
        type: 'object',
        properties: { spec_id: { type: 'string', description: 'Spec id from list_specs()' } },
        required: ['spec_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spec_content',
      description: 'Read requirement statements of one spec by req ids.',
      parameters: {
        type: 'object',
        properties: {
          spec_id: { type: 'string' },
          req_ids: { type: 'array', items: { type: 'string' }, description: 'e.g. ["r3"]' },
        },
        required: ['spec_id', 'req_ids'],
      },
    },
  },
];

export interface TreeToolDeps {
  tree: SerializedTreeIndex;
  readFile: (path: string) => string;
  root: string;
}

function executeTool(deps: TreeToolDeps, name: string, argsJson: string): string {
  const args = JSON.parse(argsJson || '{}') as { spec_id?: string; req_ids?: string[] };
  const doc = deps.tree.docs.find((d) => d.spec_id === args.spec_id);
  switch (name) {
    case 'list_specs':
      return JSON.stringify(
        deps.tree.docs.map((d) => ({ spec_id: d.spec_id, purpose: d.purpose })),
      );
    case 'get_document_structure':
      if (!doc) return `unknown spec_id: ${args.spec_id}`;
      return JSON.stringify(doc.reqs.map((r) => ({ req_id: r.req_id, title: r.title })));
    case 'get_spec_content': {
      if (!doc) return `unknown spec_id: ${args.spec_id}`;
      const wanted = new Set(args.req_ids ?? []);
      const reqs = doc.reqs.filter((r) => wanted.has(r.req_id));
      if (reqs.length === 0) return `no matching req_ids in ${args.spec_id}`;
      return reqs.map((r) => `[${r.req_id}] ${r.title}\n${r.statement}`).join('\n\n');
    }
    default:
      return `unknown tool: ${name}`;
  }
}

function parseTiers(content: string): { direct: TierEntry[]; related: TierEntry[] } {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1)
    throw new Error(`model output is not JSON: ${content.slice(0, 120)}`);
  const parsed = JSON.parse(content.slice(start, end + 1)) as {
    direct?: TierEntry[];
    related?: TierEntry[];
  };
  return { direct: parsed.direct ?? [], related: parsed.related ?? [] };
}

/**
 * r28: the model may classify one spec into both tiers (observed with real
 * models; v1 passes duplicates through). Cross-tier duplicates keep the direct
 * entry, in-tier duplicates keep the first occurrence; summary counts are
 * computed after this runs.
 */
function dedupTiers(tiers: { direct: TierEntry[]; related: TierEntry[] }): {
  direct: TierEntry[];
  related: TierEntry[];
} {
  const seenDirect = new Set<string>();
  const direct: TierEntry[] = [];
  for (const entry of tiers.direct) {
    if (seenDirect.has(entry.id)) continue;
    seenDirect.add(entry.id);
    direct.push(entry);
  }
  const related: TierEntry[] = [];
  for (const entry of tiers.related) {
    if (seenDirect.has(entry.id)) continue;
    if (related.some((kept) => kept.id === entry.id)) continue;
    related.push(entry);
  }
  return { direct, related };
}

export interface RetrieveDeps extends TreeToolDeps {
  config: ChatConfig;
  task: string;
  paths?: string;
  top?: number;
  fetchImpl?: typeof fetch;
}

export async function runContextRetrieval(deps: RetrieveDeps): Promise<ContextResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Task: ${deps.task}${deps.paths ? `\nPaths: ${deps.paths}` : ''}`,
    },
  ];

  let tiers: { direct: TierEntry[]; related: TierEntry[] } | null = null;
  let toolCalls = 0;
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS && tiers === null; round += 1) {
      const forceFinal = round === MAX_TOOL_ROUNDS;
      const body: Record<string, unknown> = {
        model: deps.config.model,
        messages,
        ...(forceFinal ? {} : { tools: TOOL_SCHEMAS, tool_choice: 'auto' }),
      };
      const resp = await fetchImpl(`${deps.config.host}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        return errorResult(`chat API ${resp.status}: ${text.slice(0, 200)}`, 'api_error');
      }
      const data = (await resp.json()) as {
        choices: {
          message: {
            content: string | null;
            tool_calls?: {
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }[];
          };
        }[];
      };
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error('chat API returned no message');

      if (message.tool_calls && message.tool_calls.length > 0) {
        toolCalls += message.tool_calls.length;
        messages.push({
          role: 'assistant',
          content: message.content ?? '',
          tool_calls: message.tool_calls,
        });
        for (const call of message.tool_calls) {
          const result = executeTool(deps, call.function.name, call.function.arguments);
          messages.push({ role: 'tool', tool_call_id: call.id, content: result });
        }
        continue;
      }
      tiers = parseTiers(message.content ?? '');
    }
  } catch (error) {
    // v1 print_err semantics: network/transport/parse failures degrade to
    // unavailable + api_error, never crash the CLI without JSON output.
    return errorResult(`retrieval failed: ${(error as Error).message}`, 'api_error');
  }
  if (tiers === null) {
    // r29: loop exhaustion degrades to agentic + truncation note + empty
    // tiers (v1 truncated RetrievalOutput), with the success summary shape.
    const noTiers: TierEntry[] = [];
    return {
      status: {
        ok: true,
        quality: 'agentic',
        qualityNote: `agentic loop hit the ${MAX_TOOL_ROUNDS}-round tool-call limit; result may be incomplete`,
      },
      direct: noTiers,
      related: [],
      summary: successSummary(deps.tree.docs.length, noTiers, [], toolCalls, deps.paths),
    };
  }
  const deduped = dedupTiers(tiers);
  const direct = deduped.direct.slice(0, deps.top ?? 5);
  const related = deduped.related.slice(0, deps.top ?? 5);
  return {
    status: { ok: true, quality: 'agentic', qualityNote: 'pageindex' },
    direct,
    related,
    summary: successSummary(deps.tree.docs.length, direct, related, toolCalls, deps.paths),
  };
}

function successSummary(
  totalSpecs: number,
  direct: TierEntry[],
  related: TierEntry[],
  toolCalls: number,
  paths?: string,
): ContextSuccessSummary {
  const pathList = paths
    ? paths
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== '')
    : [];
  return {
    totalSpecs,
    tierDirect: direct.length,
    tierRelated: related.length,
    unrelatedCount: Math.max(0, totalSpecs - direct.length - related.length),
    toolCalls,
    staleWarnings: [],
    readRecommended: direct.map((d) => d.id),
    paths: pathList,
  };
}

function errorResult(qualityNote: string, errorKind: string): ContextResult {
  return {
    status: { ok: false, quality: 'unavailable', qualityNote, errorKind },
    direct: [],
    related: [],
    summary: { totalSpecs: 0, error: true },
  };
}

export function unavailableResult(): ContextResult {
  return errorResult(
    'LLMAN_SDD_INDEX_CHAT_MODEL unset; set a tool-calling chat model: LLMAN_SDD_INDEX_CHAT_MODEL is required for the pageindex backend (agentic retrieval needs a chat model that supports tool/function calling)',
    'api_error',
  );
}
