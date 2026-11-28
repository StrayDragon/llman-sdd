/**
 * Spec-level @flow F3/F4 warnings and nested-machine gates N1–N5 (validation r169).
 * Pure — no I/O. Lives in validation so it does not import studio (r72).
 */
import type { RuleIR, ScenarioIR } from '../spec/ir.ts';
import { specIdOf } from '../spec/ir.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';
import type { SpecEntry, ValidationItem } from './validate.ts';
import {
  extractTransitions,
  FORCE_FLOW_TAG,
  isGatewayCell,
  isTransitionOutline,
  parseSubmachineRef,
  resolveStateColumns,
  resolveTransitionDecision,
  STATES_TAG,
} from './xstateTransitions.ts';

function nestAnchor(cap: string, reqId: string): string {
  return `${cap}/transitions/${reqId}`;
}

function machineKeyOf(cap: string, reqId: string, scenarioName: string): string {
  return `${cap}/${reqId || 'new'}/${scenarioName}`;
}

export function parseMachineKeyParts(
  machineKey: string,
): { capability: string; reqId: string; scenarioName: string } | null {
  const parts = machineKey.split('/');
  if (parts.length < 3) return null;
  const capability = parts[0] ?? '';
  const reqId = parts[1] ?? '';
  const scenarioName = parts.slice(2).join('/');
  if (capability === '' || reqId === '' || scenarioName === '') return null;
  return { capability, reqId, scenarioName };
}

interface CatalogMachine {
  machineKey: string;
  capability: string;
  reqId: string;
  scenarioName: string;
  ruleTitle: string;
  graphKind: 'machine' | 'flow';
  states: Set<string>;
  gateways: Set<string>;
  outs: Map<string, number>;
}

function isTransitionScenario(sc: ScenarioIR): boolean {
  const decision = resolveTransitionDecision(sc);
  if (decision === 'skip' || decision === 'conflict') return false;
  if (decision === 'sniff' && !isTransitionOutline(sc)) return false;
  return true;
}

function catalogMachines(entries: readonly SpecEntry[]): CatalogMachine[] {
  const catalog: CatalogMachine[] = [];
  for (const entry of entries) {
    const cap = specIdOf(entry);
    for (const rule of entry.doc.rules) {
      for (const sc of rule.scenarios) {
        if (!isTransitionScenario(sc)) continue;
        const transitions = extractTransitions(sc);
        const states = new Set<string>();
        const outs = new Map<string, number>();
        for (const t of transitions) {
          const from = t.from.trim();
          const to = t.to.trim();
          if (from !== '') states.add(from);
          if (to !== '') states.add(to);
          outs.set(from, (outs.get(from) ?? 0) + 1);
        }
        catalog.push({
          machineKey: machineKeyOf(cap, rule.reqId, sc.name),
          capability: cap,
          reqId: rule.reqId,
          scenarioName: sc.name,
          ruleTitle: rule.title,
          graphKind: sc.tags.includes(FORCE_FLOW_TAG) ? 'flow' : 'machine',
          states,
          gateways: new Set(),
          outs,
        });
      }
    }
  }
  return catalog;
}

function resolveTargetMachine(
  catalog: readonly CatalogMachine[],
  ref: { reqId: string; scenarioName: string | null },
): CatalogMachine[] {
  return catalog.filter((m) => {
    if (m.reqId !== ref.reqId) return false;
    if (ref.scenarioName === null) return true;
    return m.scenarioName === ref.scenarioName;
  });
}

function collectCyclePaths(edges: ReadonlyMap<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string): void => {
    if (visited.has(node)) return;
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const idx = stack.indexOf(next);
      if (idx !== -1) {
        cycles.push([...stack.slice(idx), next]);
        continue;
      }
      if (!visited.has(next)) dfs(next);
    }
    stack.pop();
    visited.add(node);
  };

  for (const node of edges.keys()) dfs(node);
  return cycles;
}

const PLACEHOLDER_NAME_RE = /^(新状态|中间态|终态|新步骤|条件判断|state|step)\d+$/iu;

function applyGatewayFlags(catalog: CatalogMachine[], entries: readonly SpecEntry[]): void {
  const hostsByRule = new Map<string, CatalogMachine[]>();
  for (const m of catalog) {
    const key = `${m.capability}\0${m.reqId}`;
    const list = hostsByRule.get(key) ?? [];
    list.push(m);
    hostsByRule.set(key, list);
  }
  for (const entry of entries) {
    const cap = specIdOf(entry);
    for (const rule of entry.doc.rules) {
      const hosts = hostsByRule.get(`${cap}\0${rule.reqId}`) ?? [];
      for (const sc of rule.scenarios) {
        if (!sc.tags.includes(STATES_TAG)) continue;
        for (const block of sc.examples ?? []) {
          const cols = resolveStateColumns(block.headers);
          if (!cols || cols.gateway === undefined) continue;
          const stateIdx = block.headers.indexOf(cols.state);
          const gwIdx = block.headers.indexOf(cols.gateway);
          for (const row of block.rows) {
            const stateName = (row[stateIdx] ?? '').trim();
            if (stateName === '' || !isGatewayCell(row[gwIdx] ?? '')) continue;
            const hit = hosts.filter((h) => h.states.has(stateName));
            if (hit.length === 1) hit[0]?.gateways.add(stateName);
          }
        }
      }
    }
  }
}

function emitFlowWarnings(catalog: readonly CatalogMachine[], items: ValidationItem[]): void {
  for (const m of catalog) {
    if (m.graphKind !== 'flow') continue;
    const id = nestAnchor(m.capability, m.reqId || m.ruleTitle);
    for (const name of m.gateways) {
      const outs = m.outs.get(name) ?? 0;
      if (outs < 2) {
        items.push({
          level: 'WARNING',
          id,
          message: `F3 gateway: condition \`${name}\` has ${String(outs)} outgoing branch(es); expected >= 2`,
        });
      }
    }
    for (const name of m.states) {
      if (PLACEHOLDER_NAME_RE.test(name)) {
        items.push({
          level: 'WARNING',
          id,
          message: `F4 placeholder name: step \`${name}\` should be renamed to a concrete action`,
        });
      }
    }
  }
}

/**
 * N1–N5 plus @flow F3/F4 WARNINGs across a full spec set (global req registry).
 * Items use `${cap}/transitions/${req}` anchors.
 */
export function validateFlowAndNesting(entries: readonly SpecEntry[]): ValidationItem[] {
  const items: ValidationItem[] = [];
  const catalog = catalogMachines(entries);
  applyGatewayFlags(catalog, entries);
  const registry = buildReqRegistry(entries);

  const byRuleHosts = new Map<string, CatalogMachine[]>();
  for (const machine of catalog) {
    const key = `${machine.capability}\0${machine.reqId}`;
    const list = byRuleHosts.get(key) ?? [];
    list.push(machine);
    byRuleHosts.set(key, list);
  }

  const nestEdges = new Map<string, string[]>();
  const addEdge = (from: string, to: string): void => {
    const list = nestEdges.get(from) ?? [];
    list.push(to);
    nestEdges.set(from, list);
  };

  for (const entry of entries) {
    const cap = specIdOf(entry);
    for (const rule of entry.doc.rules) {
      const hosts = byRuleHosts.get(`${cap}\0${rule.reqId}`) ?? [];
      const mapped = new Map<string, number>();

      for (const sc of rule.scenarios) {
        if (!sc.tags.includes(STATES_TAG)) continue;
        walkStatesRows(sc, rule, cap, hosts, catalog, registry, mapped, items, addEdge);
      }
    }
  }

  const seenCycle = new Set<string>();
  for (const cycle of collectCyclePaths(nestEdges)) {
    const path = cycle.join(' -> ');
    if (seenCycle.has(path)) continue;
    seenCycle.add(path);
    const start = parseMachineKeyParts(cycle[0] ?? '');
    const cap = start?.capability ?? cycle[0]?.split('/')[0] ?? 'unknown';
    const req = start?.reqId ?? 'unknown';
    items.push({
      level: 'ERROR',
      id: nestAnchor(cap, req),
      message: `nested machine cycle: ${path}`,
    });
  }

  emitFlowWarnings(catalog, items);
  return items;
}

function walkStatesRows(
  sc: ScenarioIR,
  rule: RuleIR,
  cap: string,
  hosts: readonly CatalogMachine[],
  catalog: readonly CatalogMachine[],
  registry: ReturnType<typeof buildReqRegistry>,
  mapped: Map<string, number>,
  items: ValidationItem[],
  addEdge: (from: string, to: string) => void,
): void {
  for (const block of sc.examples ?? []) {
    const cols = resolveStateColumns(block.headers);
    if (!cols) continue;
    const stateIdx = block.headers.indexOf(cols.state);
    const subIdx = cols.submachine === undefined ? -1 : block.headers.indexOf(cols.submachine);

    for (const row of block.rows) {
      const stateName = (row[stateIdx] ?? '').trim();
      if (stateName === '') continue;
      const hostsWithState = hosts.filter((m) => m.states.has(stateName));
      const prev = mapped.get(stateName) ?? 0;
      mapped.set(stateName, prev + 1);

      if (hostsWithState.length === 0) {
        items.push({
          level: 'ERROR',
          id: nestAnchor(cap, rule.reqId || rule.title),
          message: `host state \`${stateName}\` in \`${sc.name}\` does not exist in the host machine`,
        });
      } else if (hostsWithState.length > 1) {
        items.push({
          level: 'ERROR',
          id: nestAnchor(cap, rule.reqId || rule.title),
          message: `host state \`${stateName}\` is ambiguous across multiple machines in the same rule`,
        });
      }
      if (prev >= 1) {
        items.push({
          level: 'ERROR',
          id: nestAnchor(cap, rule.reqId || rule.title),
          message: `host state \`${stateName}\` is mapped more than once in the same rule`,
        });
      }
      if (hostsWithState.length !== 1 || prev >= 1) continue;

      const subCell = subIdx === -1 ? '' : (row[subIdx] ?? '');
      const ref = parseSubmachineRef(subCell);
      if (ref === null) continue;
      if (ref.reqId === '') {
        items.push({
          level: 'ERROR',
          id: nestAnchor(cap, rule.reqId || rule.title),
          message: `dangling nested machine reference in \`${sc.name}\`: \`${ref.raw}\` is not a valid @req handle`,
        });
        continue;
      }
      if (!registry.byId.has(ref.reqId)) {
        items.push({
          level: 'ERROR',
          id: nestAnchor(cap, rule.reqId || rule.title),
          message: `dangling nested machine reference in \`${sc.name}\`: \`@req:${ref.reqId}\` does not exist`,
        });
        continue;
      }
      const targets = resolveTargetMachine(catalog, ref);
      if (targets.length === 0) {
        items.push({
          level: 'ERROR',
          id: nestAnchor(cap, rule.reqId || rule.title),
          message: `dangling nested machine reference in \`${sc.name}\`: rule \`${ref.reqId}\` has no state machine`,
        });
        continue;
      }
      if (targets.length > 1) {
        items.push({
          level: 'ERROR',
          id: nestAnchor(cap, rule.reqId || rule.title),
          message: `dangling nested machine reference in \`${sc.name}\`: rule \`${ref.reqId}\` has no unique state machine`,
        });
        continue;
      }
      const host = hostsWithState[0];
      const target = targets[0];
      if (host && target) addEdge(host.machineKey, target.machineKey);
    }
  }
}
