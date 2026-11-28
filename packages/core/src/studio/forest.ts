/**
 * Pure Macro Business Forest Projection, Cross-Forest Bridge Analysis, W3 Isolation Linter,
 * and Atomic `.llman-sdd/studio/views.json` Contract (studio-core r153).
 * 100% browser-pure, 0-Token, zero direct filesystem I/O (injected StudioViewsIo only).
 */
import { z } from 'zod';

import { ruleHasRunnableScenario, specIdOf } from '../spec/ir.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';
import type { FsPort } from '../util/fsPort.ts';
import type { SpecEntry } from '../validation/validate.ts';
import { extractDecisionTables } from './decisionTree.ts';
import { extractStudioMachines } from './extract.ts';
import { foldFeatureAst } from './textfold.ts';

export const STUDIO_VIEWS_REL = '.llman-sdd/studio/views.json';

export type StudioViewsIo = Pick<
  FsPort,
  'exists' | 'readText' | 'writeText' | 'rename' | 'mkdirp' | 'currentPid' | 'now'
>;

export class StudioViewsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioViewsError';
  }
}

export const forestEdgeEvidenceSchema = z.object({
  sourceReqId: z.string().optional(),
  targetReqId: z.string().optional(),
  summary: z.string(),
});
export type ForestEdgeEvidence = z.infer<typeof forestEdgeEvidenceSchema>;

export const studioManualLinkSchema = z.object({
  id: z.string().min(1),
  fromCap: z.string().min(1),
  toCap: z.string().min(1),
  label: z.string().optional(),
});
export type StudioManualLink = z.infer<typeof studioManualLinkSchema>;

export const studioManualGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tone: z.string().optional(),
  capabilities: z.array(z.string().min(1)),
  collapsed: z.boolean().optional(),
});
export type StudioManualGroup = z.infer<typeof studioManualGroupSchema>;

export const studioTabViewSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  pinned: z.boolean().optional(),
  includedCapabilities: z.array(z.string()),
  tagFilter: z.string().nullable().optional(),
  showExternalHops: z.boolean().optional(),
  bridgeOnly: z.boolean(),
  manualLinks: z.array(studioManualLinkSchema),
  manualGroups: z.array(studioManualGroupSchema),
  macroPositions: z.record(
    z.string(),
    z.object({ x: z.number().finite(), y: z.number().finite() }),
  ),
});
export type StudioTabView = z.infer<typeof studioTabViewSchema>;

export const studioViewsDocSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().min(1),
  views: z.array(studioTabViewSchema),
});
export type StudioViewsDoc = z.infer<typeof studioViewsDocSchema>;

export function defaultStudioViewsDoc(now = '1970-01-01T00:00:00.000Z'): StudioViewsDoc {
  return {
    version: 1,
    updatedAt: now,
    views: [
      {
        id: 'main',
        title: '主视图',
        pinned: true,
        includedCapabilities: [],
        tagFilter: null,
        showExternalHops: false,
        bridgeOnly: false,
        manualLinks: [],
        manualGroups: [],
        macroPositions: {},
      },
    ],
  };
}

export function parseStudioViewsDoc(rawJson: string): StudioViewsDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new StudioViewsError(
      `invalid studio views JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const checked = studioViewsDocSchema.safeParse(parsed);
  if (!checked.success) {
    const first = checked.error.issues[0];
    throw new StudioViewsError(
      `invalid studio views schema at ${first?.path.join('.') || '<root>'}: ${first?.message ?? 'unknown error'}`,
    );
  }
  return checked.data;
}

export function readStudioViews(io: StudioViewsIo): StudioViewsDoc {
  if (!io.exists(STUDIO_VIEWS_REL)) {
    return defaultStudioViewsDoc(io.now().toISOString());
  }
  return parseStudioViewsDoc(io.readText(STUDIO_VIEWS_REL));
}

let viewsWriteSeq = 0;

/**
 * Atomically persist `.llman-sdd/studio/views.json` via sibling `.tmp.<pid>.<seq>` + `rename`.
 * Strictly pure local view state — never modifies `llmanspec/specs/`.
 */
export function writeStudioViews(io: StudioViewsIo, doc: StudioViewsDoc): string {
  const checked = studioViewsDocSchema.safeParse(doc);
  if (!checked.success) {
    const first = checked.error.issues[0];
    throw new StudioViewsError(
      `refusing to write invalid studio views at ${first?.path.join('.') || '<root>'}: ${first?.message ?? 'unknown error'}`,
    );
  }
  io.mkdirp('.llman-sdd/studio');
  viewsWriteSeq += 1;
  const tmpRel = `.llman-sdd/studio/.views.tmp.${String(io.currentPid())}.${String(viewsWriteSeq)}`;
  io.writeText(tmpRel, `${JSON.stringify(checked.data, null, 2)}\n`);
  io.rename(tmpRel, STUDIO_VIEWS_REL);
  return STUDIO_VIEWS_REL;
}

export type ForestNodeKind = 'machine' | 'flow' | 'decision' | 'doc';

export interface ForestNode {
  id: string;
  title: string;
  file: string;
  kind: ForestNodeKind;
  hardness: 'doc' | 'tested' | 'drift-guarded' | 'formal';
  ruleCount: number;
  scenarioCount: number;
  decisionTableCount: number;
  /** Longest subMachineKey chain among this capability's machines (0 if none). Optional so P4 UI can omit until P5. */
  maxNestingDepth?: number;
  /** Distinct nested machines referenced from this capability's states. Optional so P4 UI can omit until P5. */
  nestedMachineCount?: number;
  machineKeys: string[];
  weight: number;
  tags: string[];
  reqPreview: string[];
  summary: string;
}

export interface ForestEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: 'spec-ref';
  evidence: ForestEdgeEvidence[];
}

export interface ForestGraph {
  nodes: ForestNode[];
  edges: ForestEdge[];
}

export interface ForestGroupSpec {
  id: string;
  capabilities: readonly string[];
}

export interface CrossForestBridgeItem {
  edgeId: string;
  from: string;
  to: string;
  fromGroupId: string;
  toGroupId: string;
  label: string;
  evidence: ForestEdgeEvidence[];
}

export interface CrossForestBridgeResult {
  bridgeEdgeIds: string[];
  bridgeNodeIds: string[];
  bridges: CrossForestBridgeItem[];
}

export interface ForestDiagnostic {
  code: 'W3';
  severity: 'warning';
  capability: string;
  message: string;
}

/**
 * 0-Token pure domain projection of `SpecEntry[]` into a 4-kind Macro Business Forest
 * (`machine` / `flow` / `decision` / `doc`) with weighted nodes and cross-capability evidence edges.
 */
export function buildForestGraph(entries: readonly SpecEntry[]): ForestGraph {
  const extracted = extractStudioMachines(entries);
  const machinesByCap = new Map<string, typeof extracted>();
  for (const m of extracted) {
    const cap = m.machine.capability;
    const list = machinesByCap.get(cap) ?? [];
    list.push(m);
    machinesByCap.set(cap, list);
  }

  const registry = buildReqRegistry(entries);
  const reqToCap = new Map<string, string>();
  for (const [reqId, occs] of registry.byId.entries()) {
    const first = occs[0];
    if (!first) continue;
    const owner = entries.find((e) => e.fileName === first.fileName);
    if (owner) reqToCap.set(reqId, specIdOf(owner));
  }

  const nodes: ForestNode[] = [];
  const edgeByPair = new Map<
    string,
    { from: string; to: string; labels: Set<string>; evidence: ForestEdgeEvidence[] }
  >();

  const addEvidenceEdge = (
    from: string,
    to: string,
    label: string,
    ev: ForestEdgeEvidence,
  ): void => {
    if (from === to) return;
    const pairKey = `${from}->${to}`;
    let bucket = edgeByPair.get(pairKey);
    if (!bucket) {
      bucket = { from, to, labels: new Set<string>(), evidence: [] };
      edgeByPair.set(pairKey, bucket);
    }
    bucket.labels.add(label);
    const dup = bucket.evidence.some(
      (e) =>
        e.sourceReqId === ev.sourceReqId &&
        e.targetReqId === ev.targetReqId &&
        e.summary === ev.summary,
    );
    if (!dup) bucket.evidence.push(ev);
  };

  for (const entry of entries) {
    const id = specIdOf(entry);
    const capMachines = machinesByCap.get(id) ?? [];
    const machineKeys = capMachines.map((m) => m.machine.machineKey);
    const decisionTables = extractDecisionTables(entry.doc);
    const allTags = Array.from(
      new Set(entry.doc.rules.flatMap((r) => r.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)))),
    ).slice(0, 6);

    const hasFlowTag =
      capMachines.some((m) => m.machine.graphKind === 'flow') ||
      allTags.some((t) => /^#(flow|flowchart|workflow)$/iu.test(t));

    const kind: ForestNodeKind =
      capMachines.length > 0
        ? hasFlowTag
          ? 'flow'
          : 'machine'
        : decisionTables.length > 0
          ? 'decision'
          : 'doc';

    const ruleCount = entry.doc.rules.length;
    const scenarioCount =
      entry.doc.rules.reduce((sum, r) => sum + r.scenarios.length, 0) + entry.doc.orphans.length;
    const runnableRules = entry.doc.rules.filter((r) => ruleHasRunnableScenario(r)).length;
    const hardness: ForestNode['hardness'] =
      machineKeys.length > 0 ? 'drift-guarded' : runnableRules > 0 ? 'tested' : 'doc';

    const capMachineList = capMachines.map((m) => m.machine);
    const byKey = new Map(extracted.map((m) => [m.machine.machineKey, m.machine]));
    const depthMemo = new Map<string, number>();
    const nestDepth = (key: string, stack: Set<string>): number => {
      if (stack.has(key)) return 0;
      const cached = depthMemo.get(key);
      if (cached !== undefined) return cached;
      const node = byKey.get(key);
      const children = (node?.states ?? [])
        .map((s) => s.subMachineKey)
        .filter((k): k is string => k !== undefined && k !== '');
      if (children.length === 0) {
        depthMemo.set(key, 0);
        return 0;
      }
      stack.add(key);
      const depth = 1 + Math.max(...children.map((c) => nestDepth(c, stack)));
      stack.delete(key);
      depthMemo.set(key, depth);
      return depth;
    };
    const nestedKeys = new Set<string>();
    let maxNestingDepth = 0;
    for (const m of capMachineList) {
      maxNestingDepth = Math.max(maxNestingDepth, nestDepth(m.machineKey, new Set()));
      for (const s of m.states) {
        if (s.subMachineKey) nestedKeys.add(s.subMachineKey);
      }
    }
    const nestedMachineCount = nestedKeys.size;

    const weight = Number((ruleCount + scenarioCount * 0.5 + machineKeys.length * 3).toFixed(2));
    const levels = foldFeatureAst(entry.doc);
    const reqPreview = entry.doc.rules
      .map((r) => `@req:${r.reqId}`)
      .filter((x) => x !== '@req:')
      .slice(0, 3);

    nodes.push({
      id,
      title: id,
      file: entry.fileName,
      kind,
      hardness,
      ruleCount,
      scenarioCount,
      decisionTableCount: decisionTables.length,
      maxNestingDepth,
      nestedMachineCount,
      machineKeys,
      weight,
      tags: allTags,
      reqPreview,
      summary: levels[3],
    });

    // Scan cross-capability @req:<id> clauses with upstream/downstream awareness
    for (const rule of entry.doc.rules) {
      const bodyText = `${rule.title}\n${rule.description}`;
      for (const rawClause of bodyText.split(/[。；;\n]/u)) {
        const clause = rawClause.trim();
        if (clause === '') continue;
        const isUpstreamClause = /(前置|依赖|上游|based on|depends on|upstream)/iu.test(clause);
        for (const match of clause.matchAll(/@req:([a-zA-Z0-9_-]+)/gu)) {
          const targetReq = match[1];
          if (!targetReq) continue;
          const targetCap = reqToCap.get(targetReq);
          if (!targetCap || targetCap === id) continue;
          const fromCap = isUpstreamClause ? targetCap : id;
          const toCap = isUpstreamClause ? id : targetCap;
          addEvidenceEdge(fromCap, toCap, `@req:${targetReq}`, {
            ...(rule.reqId ? { sourceReqId: rule.reqId } : {}),
            targetReqId: targetReq,
            summary: clause.slice(0, 120),
          });
        }
      }
    }
  }

  let seq = 0;
  const edges: ForestEdge[] = [];
  for (const bucket of edgeByPair.values()) {
    seq += 1;
    const labels = Array.from(bucket.labels);
    const label =
      labels.length <= 2 ? labels.join(' · ') : `${labels[0]!} +${String(labels.length - 1)}`;
    edges.push({
      id: `ref_${String(seq)}`,
      from: bucket.from,
      to: bucket.to,
      label,
      kind: 'spec-ref',
      evidence: bucket.evidence,
    });
  }

  return { nodes, edges };
}

/**
 * Identify automatic solid contract edges bridging two distinct domain groups (Cross-Forest Bridge).
 */
export function computeCrossForestBridges(
  graph: ForestGraph,
  groups: readonly ForestGroupSpec[],
): CrossForestBridgeResult {
  const capToGroup = new Map<string, string>();
  for (const g of groups) {
    for (const cap of g.capabilities) {
      if (!capToGroup.has(cap)) capToGroup.set(cap, g.id);
    }
  }

  const bridges: CrossForestBridgeItem[] = [];
  const bridgeEdgeIds: string[] = [];
  const bridgeNodeSet = new Set<string>();

  for (const edge of graph.edges) {
    const gFrom = capToGroup.get(edge.from);
    const gTo = capToGroup.get(edge.to);
    if (!gFrom || !gTo || gFrom === gTo) continue;
    bridges.push({
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      fromGroupId: gFrom,
      toGroupId: gTo,
      label: edge.label,
      evidence: edge.evidence,
    });
    bridgeEdgeIds.push(edge.id);
    bridgeNodeSet.add(edge.from);
    bridgeNodeSet.add(edge.to);
  }

  return {
    bridgeEdgeIds,
    bridgeNodeIds: Array.from(bridgeNodeSet),
    bridges,
  };
}

/**
 * W3 Macro Topology Linter: flag isolated capabilities with zero cross-capability spec references.
 */
export function validateForestIsolation(graph: ForestGraph): ForestDiagnostic[] {
  if (graph.nodes.length <= 1) return [];
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const diags: ForestDiagnostic[] = [];
  for (const n of graph.nodes) {
    if ((degree.get(n.id) ?? 0) === 0) {
      diags.push({
        code: 'W3',
        severity: 'warning',
        capability: n.id,
        message: `W3 孤立规格：能力「${n.id}」未与其他规格存在跨能力 @req 契约连线`,
      });
    }
  }
  return diags;
}
