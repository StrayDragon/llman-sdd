/**
 * Extract StudioMachineIR drafts from parsed SpecEntry[] (studio-core r128).
 * Reuses xstateTransitions.ts discovery and column-mapping — zero regex duplication.
 */
import { specIdOf } from '../spec/ir.ts';
import type { SpecEntry } from '../validation/validate.ts';
import {
  extractTransitions,
  FORCE_FLOW_TAG,
  isGatewayCell,
  isTransitionOutline,
  parseSubmachineRef,
  resolveStateColumns,
  resolveTransitionColumns,
  resolveTransitionDecision,
  STATES_TAG,
} from '../validation/xstateTransitions.ts';
import {
  cloneMachineIR,
  makeMachineKey,
  type MachineDraft,
  type StudioMachineColumns,
  type StudioMachineIR,
  type StudioStateNode,
  type StudioTransitionEdge,
} from './model.ts';

export interface ExtractedStudioMachine {
  machine: StudioMachineIR;
  draft: MachineDraft;
}

/**
 * Extract all scoped-in transition-table scenarios from SpecEntry[] into StudioMachineIRs.
 * Scenarios with `@no-transitions` or conflicting tags are skipped cleanly.
 */
export function extractStudioMachines(entries: readonly SpecEntry[]): ExtractedStudioMachine[] {
  const results: ExtractedStudioMachine[] = [];

  for (const entry of entries) {
    const capability = specIdOf(entry);
    for (const rule of entry.doc.rules) {
      for (const sc of rule.scenarios) {
        const decision = resolveTransitionDecision(sc);
        if (decision === 'skip' || decision === 'conflict') continue;
        if (decision === 'sniff' && !isTransitionOutline(sc)) continue;

        const cols =
          sc.examples?.map((ex) => resolveTransitionColumns(ex.headers)).find((c) => c !== null) ??
          null;
        if (!cols) continue;

        const rawTransitions = extractTransitions(sc);
        const stateUidByName = new Map<string, string>();
        const states: StudioStateNode[] = [];

        const ensureState = (rawName: string): string => {
          const name = rawName.trim();
          const existing = stateUidByName.get(name);
          if (existing !== undefined) return existing;
          const uid = `s${String(states.length + 1)}`;
          stateUidByName.set(name, uid);
          states.push({ uid, name });
          return uid;
        };

        const transitions: StudioTransitionEdge[] = rawTransitions.map((t, idx) => {
          const fromUid = ensureState(t.from);
          const toUid = ensureState(t.to);
          const guardTrimmed = t.guard?.trim();
          return {
            uid: `e${String(idx + 1)}`,
            fromUid,
            event: t.event.trim(),
            ...(guardTrimmed !== undefined && guardTrimmed !== '' ? { guard: guardTrimmed } : {}),
            toUid,
          };
        });

        const initialStateUid = transitions[0]?.fromUid ?? states[0]?.uid ?? null;
        const machineKey = makeMachineKey(capability, rule.reqId || null, sc.name);
        const machine: StudioMachineIR = {
          machineKey,
          capability,
          reqId: rule.reqId || null,
          ruleTitle: rule.title,
          scenarioName: sc.name,
          ...(sc.tags.includes(FORCE_FLOW_TAG) ? { graphKind: 'flow' as const } : {}),
          initialStateUid,
          columns: {
            from: cols.from,
            event: cols.event,
            to: cols.to,
            ...(cols.guard !== undefined ? { guard: cols.guard } : {}),
          },
          states,
          transitions,
        };

        const draft: MachineDraft = {
          mode: 'modify',
          baseline: cloneMachineIR(machine),
          current: cloneMachineIR(machine),
          sourceFile: entry.fileName,
        };

        results.push({ machine, draft });
      }
    }
  }

  applyStateAttributes(results, entries);
  return results;
}

function applyStateAttributes(
  results: ExtractedStudioMachine[],
  entries: readonly SpecEntry[],
): void {
  const catalog = results.map((r) => r.machine);
  const hostsByRule = new Map<string, ExtractedStudioMachine[]>();
  for (const item of results) {
    const key = `${item.machine.capability}\0${item.machine.reqId ?? ''}`;
    const list = hostsByRule.get(key) ?? [];
    list.push(item);
    hostsByRule.set(key, list);
  }

  for (const entry of entries) {
    const capability = specIdOf(entry);
    for (const rule of entry.doc.rules) {
      const hosts = hostsByRule.get(`${capability}\0${rule.reqId}`) ?? [];
      if (hosts.length === 0) continue;
      for (const sc of rule.scenarios) {
        if (!sc.tags.includes(STATES_TAG)) continue;
        for (const block of sc.examples ?? []) {
          const cols = resolveStateColumns(block.headers);
          if (!cols) continue;
          const stateIdx = block.headers.indexOf(cols.state);
          const subIdx =
            cols.submachine === undefined ? -1 : block.headers.indexOf(cols.submachine);
          const gwIdx = cols.gateway === undefined ? -1 : block.headers.indexOf(cols.gateway);
          for (const row of block.rows) {
            const stateName = (row[stateIdx] ?? '').trim();
            if (stateName === '') continue;
            const hostsWithState = hosts.filter((h) =>
              h.machine.states.some((s) => s.name === stateName),
            );
            if (hostsWithState.length !== 1) continue;
            const host = hostsWithState[0];
            if (!host) continue;
            const state = host.machine.states.find((s) => s.name === stateName);
            if (!state) continue;
            if (gwIdx !== -1 && isGatewayCell(row[gwIdx] ?? '')) {
              state.isGateway = true;
            }
            const ref = parseSubmachineRef(subIdx === -1 ? '' : (row[subIdx] ?? ''));
            if (ref === null || ref.reqId === '') continue;
            const targets = catalog.filter((m) => {
              if ((m.reqId ?? '') !== ref.reqId) return false;
              if (ref.scenarioName === null) return true;
              return m.scenarioName === ref.scenarioName;
            });
            if (targets.length !== 1) continue;
            const targetKey = targets[0]?.machineKey;
            if (targetKey) state.subMachineKey = targetKey;
          }
        }
      }
    }
  }

  for (const item of results) {
    item.draft.baseline = cloneMachineIR(item.machine);
    item.draft.current = cloneMachineIR(item.machine);
  }
}

export interface CreateMachineDraftInput {
  capability: string;
  ruleTitle: string;
  scenarioName: string;
  sourceFile?: string;
  reqId?: string | null;
  graphKind?: StudioMachineIR['graphKind'];
  columns?: StudioMachineColumns;
  states: Array<{
    name: string;
    initial?: boolean;
    isGateway?: boolean;
    subMachineKey?: string;
  }>;
  transitions: Array<{ from: string; event: string; guard?: string; to: string }>;
}

/** Build a 0 -> 1 `mode: 'create'` draft with `baseline: null`. */
export function createMachineDraft(input: CreateMachineDraftInput): MachineDraft {
  const stateUidByName = new Map<string, string>();
  const states: StudioStateNode[] = [];
  let initialStateUid: string | null = null;

  for (const s of input.states) {
    const name = s.name.trim();
    if (stateUidByName.has(name)) continue;
    const uid = `s${String(states.length + 1)}`;
    stateUidByName.set(name, uid);
    states.push({
      uid,
      name,
      ...(s.isGateway === true ? { isGateway: true } : {}),
      ...(s.subMachineKey !== undefined && s.subMachineKey !== ''
        ? { subMachineKey: s.subMachineKey }
        : {}),
    });
    if (s.initial && initialStateUid === null) initialStateUid = uid;
  }

  const ensureState = (rawName: string): string => {
    const name = rawName.trim();
    const existing = stateUidByName.get(name);
    if (existing !== undefined) return existing;
    const uid = `s${String(states.length + 1)}`;
    stateUidByName.set(name, uid);
    states.push({ uid, name });
    return uid;
  };

  const transitions: StudioTransitionEdge[] = input.transitions.map((t, idx) => {
    const fromUid = ensureState(t.from);
    const toUid = ensureState(t.to);
    const guardTrimmed = t.guard?.trim();
    return {
      uid: `e${String(idx + 1)}`,
      fromUid,
      event: t.event.trim(),
      ...(guardTrimmed !== undefined && guardTrimmed !== '' ? { guard: guardTrimmed } : {}),
      toUid,
    };
  });

  if (initialStateUid === null) {
    initialStateUid = transitions[0]?.fromUid ?? states[0]?.uid ?? null;
  }

  const hasGuard = transitions.some((t) => t.guard !== undefined && t.guard !== '');
  const columns: StudioMachineColumns = input.columns ?? {
    from: '初始状态',
    event: '事件',
    to: '目标状态',
    ...(hasGuard ? { guard: '守卫' } : {}),
  };

  const machine: StudioMachineIR = {
    machineKey: makeMachineKey(input.capability, input.reqId ?? null, input.scenarioName),
    capability: input.capability,
    reqId: input.reqId ?? null,
    ruleTitle: input.ruleTitle,
    scenarioName: input.scenarioName,
    ...(input.graphKind !== undefined ? { graphKind: input.graphKind } : {}),
    initialStateUid,
    columns,
    states,
    transitions,
  };

  return {
    mode: 'create',
    baseline: null,
    current: machine,
    sourceFile: input.sourceFile ?? `llmanspec/specs/${input.capability}.feature`,
  };
}

/** Mark an existing machine draft as scheduled for removal (`mode: 'remove'`). */
export function markMachineRemoved(draft: MachineDraft): MachineDraft {
  return {
    mode: 'remove',
    baseline: draft.baseline ? cloneMachineIR(draft.baseline) : null,
    current: null,
    sourceFile: draft.sourceFile,
  };
}
