/**
 * Extensible full-graph Linter for StudioMachineIR (studio-core r129).
 * Collects ALL diagnostics (blocking E1-E4 errors + non-blocking W1-W2 warnings)
 * with exact stateUid / edgeUid anchors using @statelyai/graph. Pure — zero I/O.
 */
import { addEdge, addNode, createGraph, genBFS, hasPath } from '@statelyai/graph';

import type { StudioMachineIR } from './model.ts';

export type DiagnosticSeverity = 'error' | 'warning';
export type DiagnosticTargetKind = 'machine' | 'state' | 'edge';
export type DiagnosticFixKind = 'delete-edge';

export interface StudioLinterRuleMeta {
  code: string;
  severity: DiagnosticSeverity;
  name: string;
  description: string;
}

export interface MachineDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  targetKind: DiagnosticTargetKind;
  targetId: string | null;
  /** Additional related edge uids (e.g. both conflicting edges on E2). */
  relatedIds?: string[];
  fixable?: DiagnosticFixKind;
  message: string;
}

export const STUDIO_LINTER_RULES: readonly StudioLinterRuleMeta[] = [
  {
    code: 'E1',
    severity: 'error',
    name: 'Structure completeness',
    description: 'At least 2 distinct non-empty states and 1 valid non-empty transition',
  },
  {
    code: 'E2',
    severity: 'error',
    name: 'Determinism conflict',
    description: 'Duplicate (fromUid, event, guard) transition on the same source state',
  },
  {
    code: 'E3',
    severity: 'error',
    name: 'Unreachable state',
    description: 'Every state must be reachable from initialStateUid',
  },
  {
    code: 'E4',
    severity: 'error',
    name: 'Deadlock or trap',
    description: 'Non-terminal states must reach a terminal state (or return to initial state)',
  },
  {
    code: 'W1',
    severity: 'warning',
    name: 'Unguarded fallback missing',
    description: 'State with a single guarded outgoing edge has no fallback branch',
  },
  {
    code: 'W2',
    severity: 'warning',
    name: 'Placeholder state name',
    description: 'Draft placeholder name should be replaced with a domain state name',
  },
] as const;

const PLACEHOLDER_NAME_RE = /^(新状态|中间态|终态|新步骤|条件判断|state|step)\d+$/iu;

export const FLOWCHART_LINTER_RULES: readonly StudioLinterRuleMeta[] = [
  {
    code: 'F1',
    severity: 'error',
    name: 'Flow start/end completeness',
    description: 'Flowchart requires at least 2 distinct steps, 1 transition, and a start step',
  },
  {
    code: 'F2',
    severity: 'error',
    name: 'Unreachable flow step',
    description: 'Every step must be reachable from the start step',
  },
  {
    code: 'F3',
    severity: 'warning',
    name: 'Gateway branch completeness',
    description: 'Condition gateway step should have at least 2 outgoing branches',
  },
  {
    code: 'F4',
    severity: 'warning',
    name: 'Placeholder step name',
    description: 'Draft placeholder step name should be replaced with a domain action',
  },
] as const;

function validateFlowchartGraph(machine: StudioMachineIR): MachineDiagnostic[] {
  const diagnostics: MachineDiagnostic[] = [];
  const stateByUid = new Map(machine.states.map((s) => [s.uid, s]));
  const nameOf = (uid: string): string => stateByUid.get(uid)?.name || uid;
  const validEdges = machine.transitions.filter(
    (e) => stateByUid.has(e.fromUid) && stateByUid.has(e.toUid),
  );

  // F1: Start/end & basic structure completeness
  const distinctNames = new Set(machine.states.map((s) => s.name.trim()).filter((n) => n !== ''));
  if (distinctNames.size < 2 || validEdges.length < 1) {
    diagnostics.push({
      code: 'F1',
      severity: 'error',
      targetKind: 'machine',
      targetId: null,
      message: 'F1 structure: flowchart requires at least 2 steps and 1 valid connection',
    });
  }
  const initialUid =
    machine.initialStateUid && stateByUid.has(machine.initialStateUid)
      ? machine.initialStateUid
      : (validEdges[0]?.fromUid ?? machine.states[0]?.uid ?? null);

  // F2: Reachability from start step
  if (initialUid !== null && machine.states.length > 0) {
    const graph = createGraph();
    for (const s of machine.states) addNode(graph, { id: s.uid });
    for (const e of validEdges) {
      addEdge(graph, { id: e.uid, sourceId: e.fromUid, targetId: e.toUid });
    }
    const reachable = new Set(
      [...genBFS(graph, initialUid)]
        .map((n) => (typeof n === 'object' && n !== null && 'id' in n ? String(n.id) : String(n)))
        .filter((id) => id !== ''),
    );
    for (const s of machine.states) {
      if (!reachable.has(s.uid)) {
        diagnostics.push({
          code: 'F2',
          severity: 'error',
          targetKind: 'state',
          targetId: s.uid,
          message: `F2 unreachable: step \`${s.name}\` cannot be reached from \`${nameOf(initialUid)}\``,
        });
      }
    }
  }

  // F3 & F4: Gateway branching and placeholder names
  for (const s of machine.states) {
    if (s.isGateway) {
      const outs = validEdges.filter((e) => e.fromUid === s.uid);
      if (outs.length < 2) {
        diagnostics.push({
          code: 'F3',
          severity: 'warning',
          targetKind: 'state',
          targetId: s.uid,
          message: `F3 gateway: condition \`${s.name}\` has ${String(outs.length)} outgoing branch(es); expected >= 2`,
        });
      }
    }
    if (PLACEHOLDER_NAME_RE.test(s.name.trim())) {
      diagnostics.push({
        code: 'F4',
        severity: 'warning',
        targetKind: 'state',
        targetId: s.uid,
        message: `F4 placeholder name: step \`${s.name}\` should be renamed to a concrete action`,
      });
    }
  }

  return diagnostics;
}

/**
 * Validate a StudioMachineIR against dialect-isolated rules:
 * - graphKind === 'flow': Flowchart Linter (F1-F4)
 * - default ('machine'): State Machine Linter (E1-E4 blocking errors + W1-W2 warnings)
 * Never short-circuits on the first error so interactive UI can highlight every issue at once.
 */
export function validateMachineGraph(machine: StudioMachineIR): MachineDiagnostic[] {
  if (machine.graphKind === 'flow') {
    return validateFlowchartGraph(machine);
  }
  const diagnostics: MachineDiagnostic[] = [];
  const stateByUid = new Map(machine.states.map((s) => [s.uid, s]));
  const nameOf = (uid: string): string => stateByUid.get(uid)?.name || uid;

  // --- E1: Structure completeness ---
  const distinctNonEmptyNames = new Set(
    machine.states.map((s) => s.name.trim()).filter((n) => n !== ''),
  );
  if (distinctNonEmptyNames.size < 2 || machine.transitions.length < 1) {
    diagnostics.push({
      code: 'E1',
      severity: 'error',
      targetKind: 'machine',
      targetId: null,
      message: 'E1 structure: machine requires at least 2 distinct states and 1 transition',
    });
  }

  for (const s of machine.states) {
    if (s.name.trim() === '') {
      diagnostics.push({
        code: 'E1',
        severity: 'error',
        targetKind: 'state',
        targetId: s.uid,
        message: `E1 structure: state \`${s.uid}\` has an empty name`,
      });
    }
  }

  for (const e of machine.transitions) {
    if (e.event.trim() === '') {
      diagnostics.push({
        code: 'E1',
        severity: 'error',
        targetKind: 'edge',
        targetId: e.uid,
        message: `E1 structure: transition \`${e.uid}\` has an empty event`,
      });
    }
    if (!stateByUid.has(e.fromUid) || !stateByUid.has(e.toUid)) {
      diagnostics.push({
        code: 'E1',
        severity: 'error',
        targetKind: 'edge',
        targetId: e.uid,
        message: `E1 structure: transition \`${e.uid}\` references missing state endpoint`,
      });
    }
  }

  // --- E2: Determinism conflict ---
  const seenEdges = new Map<string, string>();
  for (const e of machine.transitions) {
    const key = `${e.fromUid}\0${e.event.trim()}\0${(e.guard ?? '').trim()}`;
    const firstUid = seenEdges.get(key);
    if (firstUid !== undefined) {
      const guardPart = e.guard ? ` [${e.guard}]` : '';
      diagnostics.push({
        code: 'E2',
        severity: 'error',
        targetKind: 'edge',
        targetId: e.uid,
        relatedIds: [firstUid, e.uid],
        fixable: 'delete-edge',
        message: `E2 determinism: state \`${nameOf(e.fromUid)}\` has duplicate transition on \`${e.event}\`${guardPart}`,
      });
    } else {
      seenEdges.set(key, e.uid);
    }
  }

  // --- E3 & E4: Graph reachability and deadlock/trap via @statelyai/graph ---
  const validEdges = machine.transitions.filter(
    (e) => stateByUid.has(e.fromUid) && stateByUid.has(e.toUid),
  );
  const initialUid =
    machine.initialStateUid && stateByUid.has(machine.initialStateUid)
      ? machine.initialStateUid
      : (validEdges[0]?.fromUid ?? machine.states[0]?.uid ?? null);

  if (initialUid !== null && machine.states.length > 0) {
    const graph = createGraph();
    for (const s of machine.states) addNode(graph, { id: s.uid });
    for (const e of validEdges) {
      addEdge(graph, { id: e.uid, sourceId: e.fromUid, targetId: e.toUid });
    }

    const reachable = new Set(
      [...genBFS(graph, initialUid)]
        .map((n) => (typeof n === 'object' && n !== null && 'id' in n ? String(n.id) : String(n)))
        .filter((id) => id !== ''),
    );

    for (const s of machine.states) {
      if (!reachable.has(s.uid)) {
        diagnostics.push({
          code: 'E3',
          severity: 'error',
          targetKind: 'state',
          targetId: s.uid,
          message: `E3 unreachable: state \`${s.name}\` cannot be reached from \`${nameOf(initialUid)}\``,
        });
      }
    }

    if (validEdges.length > 0) {
      const outDegree = new Map<string, number>();
      for (const s of machine.states) outDegree.set(s.uid, 0);
      for (const e of validEdges) {
        outDegree.set(e.fromUid, (outDegree.get(e.fromUid) ?? 0) + 1);
      }
      const terminals = machine.states
        .filter((s) => (outDegree.get(s.uid) ?? 0) === 0)
        .map((s) => s.uid);

      if (terminals.length > 0) {
        const terminalSet = new Set(terminals);
        for (const s of machine.states) {
          if (terminalSet.has(s.uid)) continue;
          const canExit = terminals.some((term) => hasPath(graph, s.uid, term));
          if (!canExit) {
            diagnostics.push({
              code: 'E4',
              severity: 'error',
              targetKind: 'state',
              targetId: s.uid,
              message: `E4 deadlock: state \`${s.name}\` cannot reach any terminal state`,
            });
          }
        }
      } else {
        for (const s of machine.states) {
          if (s.uid === initialUid) continue;
          if (!hasPath(graph, s.uid, initialUid)) {
            diagnostics.push({
              code: 'E4',
              severity: 'error',
              targetKind: 'state',
              targetId: s.uid,
              message: `E4 trap: state \`${s.name}\` cannot return to initial state \`${nameOf(initialUid)}\``,
            });
          }
        }
      }
    }
  }

  // --- Extensible Warning Rules (W1, W2) ---
  for (const s of machine.states) {
    const outs = validEdges.filter((e) => e.fromUid === s.uid);
    const guarded = outs.filter((e) => e.guard !== undefined && e.guard.trim() !== '');
    const unguarded = outs.filter((e) => e.guard === undefined || e.guard.trim() === '');
    if (guarded.length === 1 && unguarded.length === 0) {
      const onlyEdge = guarded[0];
      if (onlyEdge) {
        diagnostics.push({
          code: 'W1',
          severity: 'warning',
          targetKind: 'edge',
          targetId: onlyEdge.uid,
          message: `W1 guard coverage: state \`${s.name}\` only has guarded branch [${onlyEdge.guard ?? ''}] without a fallback`,
        });
      }
    }
    if (PLACEHOLDER_NAME_RE.test(s.name.trim())) {
      diagnostics.push({
        code: 'W2',
        severity: 'warning',
        targetKind: 'state',
        targetId: s.uid,
        message: `W2 placeholder name: state \`${s.name}\` should be renamed to a domain term`,
      });
    }
  }

  return diagnostics;
}

export function hasBlockingDiagnostics(diagnostics: readonly MachineDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
