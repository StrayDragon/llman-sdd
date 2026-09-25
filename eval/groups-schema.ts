/** Schema + FILL placeholders for eval/groups.yaml. Example YAML is generated from this file. */

export const FILL_WORKTREE_B = '/FILL/worktree-b';
export const FILL_MODEL = 'FILL-vllm-model';
export const FILL_MARK = 'FILL';

export const PI_PROVIDER_DEFAULT = 'fusionsparks';
export const PI_API_DEFAULT = 'openai-responses';
export const PI_API_KEY_DEFAULT = 'not-needed';
export const PI_THINKING_DEFAULT = 'max';
export const PI_CONFIG_DIR_IN_CONTAINER = '/tmp/pi-config';
export const PI_SEED_DIR_IN_CONTAINER = '/opt/pi-seed';

export const PI_THINKING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;
export type PiThinking = (typeof PI_THINKING_LEVELS)[number];

export type EvalGroup = { worktree?: string | null };
export type EvalPiConfig = {
  provider?: string;
  api?: string;
  api_key?: string;
  thinking?: PiThinking;
};
export type EvalGroupsDoc = {
  n_attempts: number;
  baseline?: string;
  model: string;
  openai_base_url?: string;
  pi?: EvalPiConfig;
  groups: Record<string, EvalGroup>;
};

export type ResolvedPiConfig = {
  provider: string;
  api: string;
  apiKey: string;
  thinking: PiThinking;
  modelId: string;
  harborModel: string;
};

/** DeepSeek V4 Flash 0731 on this vLLM: unsupported Pi levels are null. */
export const PI_FLASH_THINKING_LEVEL_MAP: Record<string, string | null> = {
  minimal: null,
  low: 'low',
  medium: null,
  high: 'high',
  xhigh: null,
  max: 'max',
};

export const PI_PROVIDER_COMPAT = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  supportsUsageInStreaming: false,
  maxTokensField: 'max_output_tokens',
} as const;

export const PI_MODEL_COMPAT = {
  supportsThinkingTokenBudget: false,
  thinkingFormat: 'chat-template',
  chatTemplateKwargs: {
    thinking: { $var: 'thinking.enabled' },
    reasoning_effort: { $var: 'thinking.effort', omitWhenOff: true },
  },
} as const;

export const EXAMPLE_DOC: EvalGroupsDoc = {
  n_attempts: 1,
  baseline: 'stable',
  model: FILL_MODEL,
  openai_base_url: 'http://FILL-vllm-host:8000/v1',
  groups: {
    stable: { worktree: '' },
  },
};

function isPiThinking(value: unknown): value is PiThinking {
  return typeof value === 'string' && (PI_THINKING_LEVELS as readonly string[]).includes(value);
}

export function issuesInEvalGroups(doc: unknown): string[] {
  const issues: string[] = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return ['document must be a mapping'];
  }
  const root = doc as Record<string, unknown>;
  if (
    typeof root.n_attempts !== 'number' ||
    !Number.isInteger(root.n_attempts) ||
    root.n_attempts < 1
  ) {
    issues.push('n_attempts must be a positive integer');
  }
  if (typeof root.model !== 'string' || root.model.trim() === '') {
    issues.push('model must be a non-empty string');
  }
  if (root.pi !== undefined) {
    if (root.pi === null || typeof root.pi !== 'object' || Array.isArray(root.pi)) {
      issues.push('pi must be a mapping');
    } else {
      const pi = root.pi as Record<string, unknown>;
      if (
        pi.provider !== undefined &&
        (typeof pi.provider !== 'string' || pi.provider.trim() === '')
      ) {
        issues.push('pi.provider must be a non-empty string');
      }
      if (pi.api !== undefined && (typeof pi.api !== 'string' || pi.api.trim() === '')) {
        issues.push('pi.api must be a non-empty string');
      }
      if (pi.api_key !== undefined && typeof pi.api_key !== 'string') {
        issues.push('pi.api_key must be a string');
      }
      if (pi.thinking !== undefined && !isPiThinking(pi.thinking)) {
        issues.push(`pi.thinking must be one of ${PI_THINKING_LEVELS.join(', ')}`);
      }
    }
  }
  const groups = root.groups;
  if (groups === null || typeof groups !== 'object' || Array.isArray(groups)) {
    issues.push('groups must be a mapping');
    return issues;
  }
  const names = Object.keys(groups as Record<string, unknown>);
  if (names.length < 1) {
    issues.push('groups must contain at least 1 entry');
  }
  for (const name of names) {
    const g = (groups as Record<string, unknown>)[name];
    if (g === null || typeof g !== 'object' || Array.isArray(g)) {
      issues.push(`groups.${name} must be a mapping`);
      continue;
    }
    const worktree = (g as Record<string, unknown>).worktree;
    if (worktree !== undefined && worktree !== null && typeof worktree !== 'string') {
      issues.push(
        `groups.${name}.worktree must be a string, null, or omitted (empty = current repo)`,
      );
    }
  }
  const baseline = root.baseline;
  if (baseline !== undefined && (typeof baseline !== 'string' || !names.includes(baseline))) {
    issues.push('baseline must be a key of groups');
  }
  return issues;
}

export function resolveWorktree(raw: string | null | undefined, repoRoot: string): string {
  const trimmed = (raw ?? '').trim();
  return trimmed === '' ? repoRoot : trimmed;
}

export function splitHarborModel(
  model: string,
  defaultProvider = PI_PROVIDER_DEFAULT,
): { provider: string; id: string } {
  const trimmed = model.trim();
  const slash = trimmed.indexOf('/');
  if (slash > 0) {
    return { provider: trimmed.slice(0, slash), id: trimmed.slice(slash + 1) };
  }
  return { provider: defaultProvider, id: trimmed };
}

export function resolvePiConfig(doc: Pick<EvalGroupsDoc, 'model' | 'pi'>): ResolvedPiConfig {
  const providerDefault = doc.pi?.provider?.trim() || PI_PROVIDER_DEFAULT;
  const { provider, id } = splitHarborModel(doc.model, providerDefault);
  const thinking = doc.pi?.thinking ?? PI_THINKING_DEFAULT;
  return {
    provider,
    api: doc.pi?.api?.trim() || PI_API_DEFAULT,
    apiKey: doc.pi?.api_key?.trim() || PI_API_KEY_DEFAULT,
    thinking,
    modelId: id,
    harborModel: `${provider}/${id}`,
  };
}

export function harborModelName(model: string, provider = PI_PROVIDER_DEFAULT): string {
  const split = splitHarborModel(model, provider);
  return `${split.provider}/${split.id}`;
}

export function fillSentinelIssues(doc: EvalGroupsDoc): string[] {
  const issues: string[] = [];
  if (doc.model.includes(FILL_MARK)) issues.push(`model still contains ${FILL_MARK}`);
  if ((doc.openai_base_url ?? '').includes(FILL_MARK)) {
    issues.push(`openai_base_url still contains ${FILL_MARK}`);
  }
  if ((doc.pi?.provider ?? '').includes(FILL_MARK)) {
    issues.push(`pi.provider still contains ${FILL_MARK}`);
  }
  if ((doc.pi?.api ?? '').includes(FILL_MARK)) issues.push(`pi.api still contains ${FILL_MARK}`);
  for (const [name, g] of Object.entries(doc.groups)) {
    const wt = (g.worktree ?? '').trim();
    if (wt.includes(FILL_MARK)) issues.push(`groups.${name}.worktree still contains ${FILL_MARK}`);
  }
  return issues;
}

export function buildPiModelsJson(
  doc: Pick<EvalGroupsDoc, 'model' | 'openai_base_url' | 'pi'>,
): Record<string, unknown> {
  const pi = resolvePiConfig(doc);
  const baseUrl = (doc.openai_base_url ?? '').trim();
  return {
    providers: {
      [pi.provider]: {
        baseUrl,
        apiKey: pi.apiKey,
        api: pi.api,
        compat: { ...PI_PROVIDER_COMPAT },
        models: [
          {
            id: pi.modelId,
            name: pi.modelId,
            reasoning: true,
            thinkingLevelMap: { ...PI_FLASH_THINKING_LEVEL_MAP },
            input: ['text'],
            contextWindow: 1048576,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            compat: {
              supportsThinkingTokenBudget: PI_MODEL_COMPAT.supportsThinkingTokenBudget,
              thinkingFormat: PI_MODEL_COMPAT.thinkingFormat,
              chatTemplateKwargs: {
                thinking: { $var: 'thinking.enabled' },
                reasoning_effort: { $var: 'thinking.effort', omitWhenOff: true },
              },
            },
          },
        ],
      },
    },
  };
}

export function rewriteUrlHostname(url: string, hostname: string): string {
  const parsed = new URL(url);
  parsed.hostname = hostname;
  return parsed.toString().replace(/\/$/u, '');
}

export const PI_HOST_GATEWAY = 'host.docker.internal';

export function rewriteUrlHostPort(url: string, hostname: string, port: number): string {
  const parsed = new URL(url);
  parsed.hostname = hostname;
  parsed.port = String(port);
  return parsed.toString().replace(/\/$/u, '');
}

export function renderPiComposeOverlay(thinking: PiThinking = PI_THINKING_DEFAULT): string {
  return `services:
  harbor-docker-egress-control-sidecar:
    extra_hosts:
      - "${PI_HOST_GATEWAY}:host-gateway"
  main:
    environment:
      PI_CODING_AGENT_DIR: ${PI_CONFIG_DIR_IN_CONTAINER}
      PI_THINKING: ${thinking}
`;
}

export function renderGroupsExampleYaml(): string {
  return `# Generated by \`bun eval/render-groups-example.ts\` (SSOT: eval/groups-schema.ts).
# Do not hand-edit this file; change EXAMPLE_DOC / FILL_* and regenerate.
#
# Before a real Pi run:
#   1. cp eval/groups.yaml.example eval/groups.yaml
#   2. Replace every ${FILL_MARK} token. Empty worktree = this llman-sdd checkout.
#   3. Extra groups (e.g. experiment) are optional; omit them for a single-group run.
#   4. eval/groups.yaml is gitignored.
#   5. just eval          # default agent is Pi; missing FILL/docker/harbor → non-zero (not skip)
#   6. just eval oracle   # no LLM; calibrates assertions only
#
# Pi in Docker (auto-injected; do not rely on Harbor's thin model_api overlay):
#   just eval writes models.json (api: ${PI_API_DEFAULT}, provider ${PI_PROVIDER_DEFAULT})
#   and mounts it RO at ${PI_SEED_DIR_IN_CONTAINER} (Harbor mounts are RO-only);
#   wrapper copies it to writable ${PI_CONFIG_DIR_IN_CONTAINER} so Pi can write auth.json.
#   Bare model ids become ${PI_PROVIDER_DEFAULT}/<id>. Default --thinking is ${PI_THINKING_DEFAULT} (0731).
#   openai_base_url is written into models.json only — not exported as OPENAI_BASE_URL
#   (that would make Harbor overwrite models.json with harbor-endpoint).
#
# pi:                         # optional; defaults shown
#   provider: ${PI_PROVIDER_DEFAULT}
#   api: ${PI_API_DEFAULT}
#   thinking: ${PI_THINKING_DEFAULT}
#
n_attempts: ${EXAMPLE_DOC.n_attempts}
baseline: ${EXAMPLE_DOC.baseline}
model: ${EXAMPLE_DOC.model}
openai_base_url: ${EXAMPLE_DOC.openai_base_url}
groups:
  stable:
    worktree:    # empty = current repo
  # experiment:  # optional; uncomment to compare against baseline
  #   worktree: ${FILL_WORKTREE_B}
`;
}
