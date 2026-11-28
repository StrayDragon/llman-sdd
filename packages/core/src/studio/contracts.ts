/**
 * Shared Zod v4 API, SSE, Hub, and Deep-Link contracts for Studio Web & CLI Hub (studio-web r144, r145).
 * Single source of truth: both Hono server handlers and Studio frontend client derive TS types via z.infer
 * and validate payloads at runtime to surface contract drift immediately. Pure — zero I/O.
 */
import { z } from 'zod';

import { theoremItemSchema } from '../theorems/theorems.ts';
import { forestEdgeEvidenceSchema, studioViewsDocSchema } from './forest.ts';
import { studioStateDocSchema } from './store.ts';

export const studioGraphKindSchema = z.enum(['machine', 'flow']);
export const studioSpecKindSchema = z.enum(['machine', 'flow', 'decision', 'doc']);
export const verificationHardnessSchema = z.enum(['doc', 'tested', 'drift-guarded', 'formal']);

export const hubInfoSchema = z.object({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1),
  token: z.string().min(1),
  version: z.string().min(1),
  startedAt: z.string().min(1),
});
export type HubInfo = z.infer<typeof hubInfoSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal('llman-sdd-studio'),
  version: z.string().min(1),
  pid: z.number().int().positive(),
  workspaceCount: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const workspaceItemSchema = z.object({
  wsKey: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
  worktreePath: z.string().min(1),
  instanceRoot: z.string().min(1),
  instanceRel: z.string().min(1),
  protected: z.boolean(),
  specCount: z.number().int().nonnegative(),
});
export type WorkspaceItem = z.infer<typeof workspaceItemSchema>;

export const workspacesResponseSchema = z.object({
  activeWsKey: z.string().min(1),
  workspaces: z.array(workspaceItemSchema),
});
export type WorkspacesResponse = z.infer<typeof workspacesResponseSchema>;

export const registerWorkspaceRequestSchema = z.object({
  directory: z.string().min(1),
});
export type RegisterWorkspaceRequest = z.infer<typeof registerWorkspaceRequestSchema>;

export const specIndexItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  file: z.string().min(1),
  kind: studioSpecKindSchema,
  hardness: verificationHardnessSchema,
  ruleCount: z.number().int().nonnegative(),
  scenarioCount: z.number().int().nonnegative(),
  decisionTableCount: z.number().int().nonnegative(),
  machineKeys: z.array(z.string()),
  summary: z.string(),
  reqPreview: z.array(z.string()),
  tags: z.array(z.string()),
  stale: z.boolean(),
});
export type SpecIndexItem = z.infer<typeof specIndexItemSchema>;

export const specIndexEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string(),
  kind: z.enum(['spec-ref', 'manual']),
  evidence: z.array(forestEdgeEvidenceSchema).optional(),
});
export type SpecIndexEdge = z.infer<typeof specIndexEdgeSchema>;

export const putViewsRequestSchema = z.object({
  viewsDoc: studioViewsDocSchema,
});
export type PutViewsRequest = z.infer<typeof putViewsRequestSchema>;

export const viewsResponseSchema = z.object({
  ok: z.literal(true),
  viewsDoc: studioViewsDocSchema,
});
export type ViewsResponse = z.infer<typeof viewsResponseSchema>;

export const studioTheoremSchema = theoremItemSchema.extend({
  readOnly: z.boolean(),
});
export type StudioTheoremDto = z.infer<typeof studioTheoremSchema>;

export const theoremLockStatusSchema = z.enum(['none', 'sealed', 'unsealed', 'tampered']);
export type TheoremLockStatus = z.infer<typeof theoremLockStatusSchema>;

export const bootstrapResponseSchema = z.object({
  workspace: workspaceItemSchema,
  demoMode: z.boolean(),
  token: z.string().min(1),
  activeStateId: z.string().min(1),
  stateDoc: studioStateDocSchema,
  specs: z.array(specIndexItemSchema),
  edges: z.array(specIndexEdgeSchema),
  staleFiles: z.array(z.string()),
  peerWorktrees: z.array(workspaceItemSchema),
  graphMermaid: z.string(),
  theorems: z.array(studioTheoremSchema).optional(),
  theoremLockStatus: theoremLockStatusSchema.optional(),
});
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;

export const decisionTreeNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['condition', 'outcome']),
  label: z.string(),
  rowIndices: z.array(z.number().int().nonnegative()),
});

export const decisionTreeEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string(),
});

export const studioDecisionTableSchema = z.object({
  id: z.string().min(1),
  reqId: z.string().nullable(),
  title: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  tree: z.object({
    nodes: z.array(decisionTreeNodeSchema),
    edges: z.array(decisionTreeEdgeSchema),
  }),
});
export type StudioDecisionTableDto = z.infer<typeof studioDecisionTableSchema>;

export const specRuleItemSchema = z.object({
  reqId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  hardness: verificationHardnessSchema,
  scenarioCount: z.number().int().nonnegative(),
  scenarios: z.array(
    z.object({
      name: z.string(),
      steps: z.array(z.string()),
    }),
  ),
});
export type SpecRuleItem = z.infer<typeof specRuleItemSchema>;

export const convertibleHintSchema = z.object({
  targetKind: z.enum(['machine', 'flow', 'decision']),
  reason: z.string(),
});

export const specDetailResponseSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  purpose: z.string(),
  kind: studioSpecKindSchema,
  baseHash: z.string().min(1),
  rawText: z.string(),
  foldLevels: z.array(z.string()).length(5),
  rules: z.array(specRuleItemSchema),
  decisionTables: z.array(studioDecisionTableSchema),
  machineKeys: z.array(z.string()),
  convertibleHint: convertibleHintSchema.nullable(),
});
export type SpecDetailResponse = z.infer<typeof specDetailResponseSchema>;

export const putStateRequestSchema = z.object({
  doc: studioStateDocSchema,
  expectedRevision: z.number().int().nonnegative().optional(),
});
export type PutStateRequest = z.infer<typeof putStateRequestSchema>;

export const putStateResponseSchema = z.object({
  ok: z.literal(true),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});
export type PutStateResponse = z.infer<typeof putStateResponseSchema>;

export const putLayoutRequestSchema = z.object({
  positions: z.record(z.string(), z.object({ x: z.number().finite(), y: z.number().finite() })),
  edgeBends: z
    .record(z.string(), z.object({ dx: z.number().finite(), dy: z.number().finite() }))
    .optional(),
});
export type PutLayoutRequest = z.infer<typeof putLayoutRequestSchema>;

export const textfoldRequestSchema = z.object({
  content: z.string(),
  capability: z.string().optional(),
  endpoint: z.string().url().optional(),
});
export type TextfoldRequest = z.infer<typeof textfoldRequestSchema>;

export const textfoldResponseSchema = z.object({
  provider: z.enum(['local-ast', 'external-serve']),
  cached: z.boolean(),
  sha256: z.string().min(1),
  levels: z.array(z.string()).length(5),
});
export type TextfoldResponse = z.infer<typeof textfoldResponseSchema>;

export const exportProposalRequestSchema = z.object({
  changeId: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  dependsOn: z.array(z.string()).optional(),
});
export type ExportProposalRequest = z.infer<typeof exportProposalRequestSchema>;

export const exportProposalResponseSchema = z.object({
  ok: z.literal(true),
  changeId: z.string().min(1),
  proposalPath: z.string().min(1),
});
export type ExportProposalResponse = z.infer<typeof exportProposalResponseSchema>;

export const previewDiffResponseSchema = z.object({
  diffs: z.array(
    z.object({
      machineKey: z.string(),
      sourceFile: z.string(),
      unifiedDiff: z.string(),
      semanticDiff: z.string(),
      stale: z.boolean(),
    }),
  ),
});
export type PreviewDiffResponse = z.infer<typeof previewDiffResponseSchema>;

export const studioSseEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state-updated'),
    wsKey: z.string(),
    stateId: z.string(),
    revision: z.number().int().nonnegative(),
    originClientId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('specs-changed'),
    wsKey: z.string(),
    changedFiles: z.array(z.string()),
  }),
  z.object({
    type: z.literal('git-head-changed'),
    wsKey: z.string(),
    branch: z.string(),
    protected: z.boolean(),
  }),
  z.object({
    type: z.literal('views-updated'),
    wsKey: z.string(),
    originClientId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('ping'),
    ts: z.string(),
  }),
]);
export type StudioSseEvent = z.infer<typeof studioSseEventSchema>;

export const studioFocusObjectSchema = z.object({
  kind: z.enum(['forest', 'macro-edge', 'state', 'edge']),
  id: z.string().min(1),
});
export type StudioFocusObject = z.infer<typeof studioFocusObjectSchema>;

export const studioFocusContextSchema = z.object({
  wsKey: z.string(),
  repo: z.string(),
  branch: z.string(),
  targetKind: z.enum(['macro', 'machine', 'doc', 'state', 'edge']),
  targetId: z.string(),
  canonicalUrl: z.string(),
  summary: z.string(),
  nest: z.array(z.string().min(1)).optional(),
  focus: studioFocusObjectSchema.optional(),
});
export type StudioFocusContext = z.infer<typeof studioFocusContextSchema>;

export const studioDeepLinkJsonSchema = z.object({
  focus: studioFocusContextSchema,
  workspace: workspaceItemSchema,
  specs: z.array(specIndexItemSchema),
  edges: z.array(specIndexEdgeSchema),
});
export type StudioDeepLinkJson = z.infer<typeof studioDeepLinkJsonSchema>;

export const studioSearchTargetKindSchema = z.enum([
  'spec',
  'rule',
  'state',
  'edge',
  'decision',
  'comment',
  'timeline',
  'theorem',
]);

export const studioSearchRequestSchema = z.object({
  query: z.string().trim().min(1),
  topK: z.number().int().min(1).max(50).optional(),
  endpoint: z.string().url().optional(),
});
export type StudioSearchRequest = z.infer<typeof studioSearchRequestSchema>;

export const studioSearchHitSchema = z.object({
  id: z.string().min(1),
  targetKind: studioSearchTargetKindSchema,
  targetId: z.string().min(1),
  capId: z.string().min(1),
  machineKey: z.string().optional(),
  title: z.string().min(1),
  snippet: z.string(),
  score: z.number(),
  source: z.enum(['local-bm25', 'rag-serve']),
});
export type StudioSearchHit = z.infer<typeof studioSearchHitSchema>;

export const studioSearchResponseSchema = z.object({
  provider: z.enum(['local-bm25', 'rag-serve']),
  cached: z.boolean(),
  degradedReason: z.string().optional(),
  totalIndexed: z.number().int().nonnegative(),
  hits: z.array(studioSearchHitSchema),
});
export type StudioSearchResponse = z.infer<typeof studioSearchResponseSchema>;

export const syncPickSchema = z.enum(['ours', 'theirs', 'both']);
export type SyncPickDto = z.infer<typeof syncPickSchema>;

export const syncItemKindSchema = z.enum([
  'state',
  'transition',
  'guard',
  'doc-rule',
  'nest',
  'gateway',
]);

export const syncTransitionPayloadSchema = z.object({
  from: z.string().min(1),
  event: z.string(),
  guard: z.string().optional(),
  to: z.string().min(1),
});

export const syncItemSchema = z.object({
  id: z.string().min(1),
  kind: syncItemKindSchema,
  machineKey: z.string().min(1).optional(),
  sourceFile: z.string().min(1),
  oursPresent: z.boolean(),
  theirsPresent: z.boolean(),
  labelOurs: z.string().nullable(),
  labelTheirs: z.string().nullable(),
  defaultPick: syncPickSchema.nullable(),
  oursStateName: z.string().optional(),
  theirsStateName: z.string().optional(),
  oursTransition: syncTransitionPayloadSchema.optional(),
  theirsTransition: syncTransitionPayloadSchema.optional(),
  oursNest: z.string().nullable().optional(),
  theirsNest: z.string().nullable().optional(),
  oursGateway: z.boolean().optional(),
  theirsGateway: z.boolean().optional(),
  oursText: z.string().optional(),
  theirsText: z.string().optional(),
});
export type SyncItemDto = z.infer<typeof syncItemSchema>;

export const syncPreviewResponseSchema = z.object({
  stale: z.boolean(),
  staleFiles: z.array(z.string()),
  items: z.array(syncItemSchema),
  snapshotTaken: z.boolean(),
});
export type SyncPreviewResponse = z.infer<typeof syncPreviewResponseSchema>;

export const syncApplyRequestSchema = z.object({
  picks: z.record(z.string(), syncPickSchema),
});
export type SyncApplyRequest = z.infer<typeof syncApplyRequestSchema>;

export const syncApplyResponseSchema = z.object({
  ok: z.literal(true),
  doc: studioStateDocSchema,
  blocked: z.array(z.object({ itemId: z.string(), reason: z.string() })),
});
export type SyncApplyResponse = z.infer<typeof syncApplyResponseSchema>;
