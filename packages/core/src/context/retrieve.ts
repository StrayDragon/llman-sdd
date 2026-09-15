/**
 * Context agentic retrieval (context-index capability, r27): OpenAI-compatible
 * /chat/completions with tool calling — three local tools, 12-round cap, then
 * one forced no-tools turn. Env contract mirrors v1:
 * LLMAN_SDD_INDEX_CHAT_MODEL (required) / LLMAN_SDD_INDEX_CHAT_API_HOST|KEY
 * with LLMAN_SDD_INDEX_OPENAI_* fallbacks.
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

export interface ContextResult {
  status: {
    ok: boolean;
    quality: 'ok' | 'unavailable' | 'error';
    qualityNote: string;
    errorKind?: string;
  };
  direct: TierEntry[];
  related: TierEntry[];
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

export interface RetrieveDeps extends TreeToolDeps {
  config: ChatConfig;
  task: string;
  paths?: string;
  top?: number;
  maxRounds?: number;
  fetchImpl?: typeof fetch;
}

export async function runContextRetrieval(deps: RetrieveDeps): Promise<ContextResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const maxRounds = deps.maxRounds ?? MAX_TOOL_ROUNDS;
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Task: ${deps.task}${deps.paths ? `\nPaths: ${deps.paths}` : ''}`,
    },
  ];

  let tiers: { direct: TierEntry[]; related: TierEntry[] } | null = null;
  for (let round = 0; round <= maxRounds && tiers === null; round += 1) {
    const forceFinal = round === maxRounds;
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
      return {
        status: {
          ok: false,
          quality: 'error',
          qualityNote: `chat API ${resp.status}: ${text.slice(0, 200)}`,
          errorKind: 'api_error',
        },
        direct: [],
        related: [],
      };
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
  if (tiers === null) {
    return {
      status: {
        ok: false,
        quality: 'error',
        qualityNote: `no final answer after ${maxRounds} tool rounds`,
        errorKind: 'loop_exhausted',
      },
      direct: [],
      related: [],
    };
  }
  const capped = {
    direct: tiers.direct.slice(0, deps.top ?? 5),
    related: tiers.related.slice(0, deps.top ?? 5),
  };
  return {
    status: { ok: true, quality: 'ok', qualityNote: 'pageindex' },
    ...capped,
  };
}

export function unavailableResult(): ContextResult {
  return {
    status: {
      ok: false,
      quality: 'unavailable',
      qualityNote:
        'LLMAN_SDD_INDEX_CHAT_MODEL unset; set a tool-calling chat model: LLMAN_SDD_INDEX_CHAT_MODEL is required for the pageindex backend (agentic retrieval needs a chat model that supports tool/function calling)',
      errorKind: 'api_error',
    },
    direct: [],
    related: [],
  };
}
