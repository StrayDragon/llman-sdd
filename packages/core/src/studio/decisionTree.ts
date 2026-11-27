/**
 * Deterministic 0-LLM Decision Table -> Decision Tree compiler and structural conversion detector
 * (studio-web r146). Pure — zero I/O, zero LLM calls.
 */
import type { CapabilityDoc, ExamplesBlockIR, ScenarioIR } from '../spec/ir.ts';
import {
  resolveTransitionColumns,
  resolveTransitionDecision,
} from '../validation/xstateTransitions.ts';

export interface DecisionTreeNode {
  id: string;
  kind: 'condition' | 'outcome';
  label: string;
  rowIndices: number[];
}

export interface DecisionTreeEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface DecisionTreeGraph {
  nodes: DecisionTreeNode[];
  edges: DecisionTreeEdge[];
}

export interface StudioDecisionTable {
  id: string;
  reqId: string | null;
  title: string;
  headers: string[];
  rows: string[][];
  tree: DecisionTreeGraph;
}

export interface ConvertibleStructureHint {
  targetKind: 'machine' | 'flow' | 'decision';
  reason: string;
}

/**
 * Compile a truth/decision table (condition columns 0..k-2, outcome column k-1) into a
 * deterministic decision tree graph with zero LLM calls.
 * Splits greedily on the first condition column that partitions remaining outcomes,
 * merging uniform-outcome leaves cleanly.
 */
export function compileDecisionTableToTree(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): DecisionTreeGraph {
  const nodes: DecisionTreeNode[] = [];
  const edges: DecisionTreeEdge[] = [];
  if (headers.length < 2 || rows.length === 0) {
    return { nodes, edges };
  }

  const outCol = headers.length - 1;
  let seq = 0;
  const nextId = (prefix: string): string => {
    seq += 1;
    return `${prefix}_${String(seq)}`;
  };

  function buildSubtree(rowIndices: number[], usedCols: Set<number>): string {
    const outcomes = new Set(rowIndices.map((idx) => (rows[idx]?.[outCol] ?? '').trim()));
    if (outcomes.size === 1) {
      const outcomeLabel = [...outcomes][0] ?? '—';
      const id = nextId('out');
      nodes.push({ id, kind: 'outcome', label: outcomeLabel, rowIndices });
      return id;
    }

    // Pick best remaining condition column: first column that partitions rows into >= 2 non-empty groups
    // (preferring columns with fewest wildcards '—'/'*'/'-' and maximal outcome purity).
    let bestCol = -1;
    let bestScore = -1;
    for (let col = 0; col < outCol; col += 1) {
      if (usedCols.has(col)) continue;
      const groups = new Map<string, number[]>();
      let wildcards = 0;
      for (const rIdx of rowIndices) {
        const val = (rows[rIdx]?.[col] ?? '').trim() || '—';
        if (val === '—' || val === '-' || val === '*') wildcards += 1;
        const list = groups.get(val) ?? [];
        list.push(rIdx);
        groups.set(val, list);
      }
      if (groups.size < 2) continue;
      let pureGroups = 0;
      for (const grp of groups.values()) {
        const grpOuts = new Set(grp.map((i) => (rows[i]?.[outCol] ?? '').trim()));
        if (grpOuts.size === 1) pureGroups += 1;
      }
      const score = pureGroups * 100 - wildcards * 20 - groups.size;
      if (score > bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }

    if (bestCol === -1) {
      const merged = [...outcomes].join(' / ');
      const id = nextId('out');
      nodes.push({ id, kind: 'outcome', label: merged, rowIndices });
      return id;
    }

    const condId = nextId('cond');
    nodes.push({
      id: condId,
      kind: 'condition',
      label: headers[bestCol] ?? `条件 ${String(bestCol + 1)}`,
      rowIndices,
    });

    const groups = new Map<string, number[]>();
    for (const rIdx of rowIndices) {
      const val = (rows[rIdx]?.[bestCol] ?? '').trim() || '—';
      const list = groups.get(val) ?? [];
      list.push(rIdx);
      groups.set(val, list);
    }

    const nextUsed = new Set(usedCols);
    nextUsed.add(bestCol);
    for (const [branchVal, subRows] of groups.entries()) {
      const childId = buildSubtree(subRows, nextUsed);
      edges.push({
        id: nextId('dt_e'),
        from: condId,
        to: childId,
        label: branchVal,
      });
    }
    return condId;
  }

  buildSubtree(
    rows.map((_, idx) => idx),
    new Set(),
  );
  return { nodes, edges };
}

function isDecisionExamplesBlock(scenario: ScenarioIR, block: ExamplesBlockIR): boolean {
  if (block.headers.length < 2 || block.rows.length < 2) return false;
  if (resolveTransitionColumns(block.headers) !== null) return false;
  return resolveTransitionDecision(scenario) !== 'force';
}

/** Extract all non-state-machine Examples decision tables from a parsed CapabilityDoc. */
export function extractDecisionTables(doc: CapabilityDoc): StudioDecisionTable[] {
  const tables: StudioDecisionTable[] = [];
  let idx = 0;

  const inspectScenario = (scenario: ScenarioIR, reqId: string | null): void => {
    for (const block of scenario.examples ?? []) {
      if (!isDecisionExamplesBlock(scenario, block)) continue;
      idx += 1;
      tables.push({
        id: `dt_${String(idx)}`,
        reqId,
        title: block.name ? `${scenario.name} · ${block.name}` : scenario.name,
        headers: [...block.headers],
        rows: block.rows.map((r) => [...r]),
        tree: compileDecisionTableToTree(block.headers, block.rows),
      });
    }
  };

  for (const rule of doc.rules) {
    for (const sc of rule.scenarios) {
      inspectScenario(sc, rule.reqId || null);
    }
  }
  for (const orphan of doc.orphans) {
    inspectScenario(orphan, null);
  }
  return tables;
}

/**
 * Deterministic structural hint detecting when a rule-only spec describes clear state transitions,
 * sequential gates, or mutually exclusive decision branches.
 */
export function detectConvertibleStructure(
  doc: CapabilityDoc,
  hasMachines: boolean,
  hasDecisionTables: boolean,
): ConvertibleStructureHint | null {
  if (hasMachines || hasDecisionTables) return null;
  const joined = doc.rules.map((r) => `${r.title} ${r.description}`).join('\n');
  if (/(状态|流转|终态|回滚|生命周期|transition|state)/iu.test(joined) && doc.rules.length >= 3) {
    return {
      targetKind: 'machine',
      reason: '检测到多条规则描述了状态迁移或生命周期阶段，可转为状态机解锁 E1–E4 门禁与单步推演。',
    };
  }
  if (/(优先级|互斥|否则|组合|分支|priority|conflict)/iu.test(joined) && doc.rules.length >= 3) {
    return {
      targetKind: 'decision',
      reason: '检测到规则包含互斥条件与优先级分支，可转为决策树/真值表便于直观对照。',
    };
  }
  if (/(步骤|前置|依次|流水线|熔断|pipeline|step)/iu.test(joined) && doc.rules.length >= 2) {
    return {
      targetKind: 'flow',
      reason: '检测到前置校验与顺序处理步骤，可转为流程图直观审视正常与异常出口。',
    };
  }
  return null;
}
