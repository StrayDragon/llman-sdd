/**
 * Extract StudioMachineIR drafts from parsed SpecEntry[] (studio-core r128).
 * Reuses xstateTransitions.ts discovery and column-mapping — zero regex duplication.
 */
import { specIdOf } from '../spec/ir.ts';
import type { SpecEntry } from '../validation/validate.ts';
import {
  extractTransitions,
  isTransitionOutline,
  resolveTransitionColumns,
  resolveTransitionDecision,
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

  return results;
}

export interface CreateMachineDraftInput {
  capability: string;
  ruleTitle: string;
  scenarioName: string;
  sourceFile?: string;
  reqId?: string | null;
  columns?: StudioMachineColumns;
  states: Array<{ name: string; initial?: boolean }>;
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
    states.push({ uid, name });
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
