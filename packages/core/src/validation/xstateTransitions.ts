/**
 * Transition-table validation (validation r104, r124–r127): tag-scoped
 * discovery (@transitions force / @no-transitions escape / shape sniff),
 * Examples-table driven graph gates. The walk is @statelyai/graph. Pure — no I/O.
 */
import { createGraph, addNode, addEdge, genBFS, hasPath } from '@statelyai/graph';

import type { RuleIR, ScenarioIR } from '../spec/ir.ts';
import type { ValidationItem } from './validate.ts';

export interface TransitionEdge {
  from: string;
  event: string;
  to: string;
  guard?: string;
}

const FROM_HEADERS = new Set(['from', '初始状态']);
const EVENT_HEADERS = new Set(['event', '事件']);
const TO_HEADERS = new Set(['to', '目标状态']);
const GUARD_HEADERS = new Set(['guard', '守卫']);
const STATE_HEADERS = new Set(['state', '状态']);
const SUBMACHINE_HEADERS = new Set(['submachine', '子机']);
const GATEWAY_HEADERS = new Set(['gateway', '网关']);
const GATEWAY_TRUE = new Set(['是', 'yes', 'true']);

export const FORCE_TRANSITIONS_TAG = 'transitions';
export const ESCAPE_TRANSITIONS_TAG = 'no-transitions';
export const FORCE_FLOW_TAG = 'flow';
export const STATES_TAG = 'states';

export interface ColumnMap {
  from: string;
  event: string;
  to: string;
  guard?: string;
}

function headerMatches(headers: string[], names: Set<string>): boolean {
  return headers.some((h) => names.has(h) || names.has(h.toLowerCase()));
}

function headerIndex(headers: string[], names: Set<string>): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] ?? '';
    if (names.has(h) || names.has(h.toLowerCase())) return i;
  }
  return -1;
}

export interface StateColumnMap {
  state: string;
  submachine?: string;
  gateway?: string;
}

export function resolveStateColumns(headers: string[]): StateColumnMap | null {
  const stateIdx = headerIndex(headers, STATE_HEADERS);
  if (stateIdx === -1) return null;
  const subIdx = headerIndex(headers, SUBMACHINE_HEADERS);
  const gwIdx = headerIndex(headers, GATEWAY_HEADERS);
  return {
    state: headers[stateIdx] ?? 'state',
    ...(subIdx === -1 ? {} : { submachine: headers[subIdx] }),
    ...(gwIdx === -1 ? {} : { gateway: headers[gwIdx] }),
  };
}

export function isGatewayCell(value: string): boolean {
  return GATEWAY_TRUE.has(value.trim().toLowerCase());
}

export interface SubmachineRef {
  reqId: string;
  scenarioName: string | null;
  raw: string;
}

/** Parse `@req:<id>` or `@req:<id>#<scenario>`. Invalid / empty → null. */
export function parseSubmachineRef(cell: string): SubmachineRef | null {
  const raw = cell.trim();
  if (raw === '') return null;
  const m = /^@req:([A-Za-z0-9_-]+)(?:#(.+))?$/u.exec(raw);
  if (!m?.[1]) return { reqId: '', scenarioName: null, raw };
  return { reqId: m[1], scenarioName: m[2]?.trim() ? m[2].trim() : null, raw };
}

export function isStatesOutline(sc: ScenarioIR): boolean {
  if (sc.tags.includes(STATES_TAG)) return true;
  for (const ex of sc.examples ?? []) {
    if (resolveStateColumns(ex.headers) !== null && resolveTransitionColumns(ex.headers) === null) {
      return true;
    }
  }
  return false;
}

export function resolveTransitionColumns(headers: string[]): ColumnMap | null {
  const fromIdx = headerIndex(headers, FROM_HEADERS);
  const eventIdx = headerIndex(headers, EVENT_HEADERS);
  const toIdx = headerIndex(headers, TO_HEADERS);
  if (fromIdx === -1 || eventIdx === -1 || toIdx === -1) return null;
  const guardIdx = headerIndex(headers, GUARD_HEADERS);
  const fromCol = headers[fromIdx] ?? 'from';
  const eventCol = headers[eventIdx] ?? 'event';
  const toCol = headers[toIdx] ?? 'to';
  const guardCol = guardIdx === -1 ? undefined : headers[guardIdx];
  return { from: fromCol, event: eventCol, to: toCol, guard: guardCol };
}

/** Auto-discovery: at least two of {from, event, to} column families present. */
export function isTransitionOutline(sc: ScenarioIR): boolean {
  if (!sc.examples || sc.examples.length === 0) return false;
  for (const ex of sc.examples) {
    const h = ex.headers;
    const hasFrom = headerMatches(h, FROM_HEADERS);
    const hasEvent = headerMatches(h, EVENT_HEADERS);
    const hasTo = headerMatches(h, TO_HEADERS);
    if ((hasFrom && hasTo) || (hasFrom && hasEvent) || (hasEvent && hasTo)) return true;
  }
  return false;
}

/**
 * Single source of truth for `spec transitions` introspection (peripheral r105):
 * the discovery contract as enforced above — alias families, sniff rule, tags
 * and gates. The CLI renders this verbatim; do not duplicate it elsewhere.
 */
export const TRANSITIONS_INTROSPECTION = {
  columnFamilies: [
    { role: 'from', aliases: ['from', '初始状态'] },
    { role: 'event', aliases: ['event', '事件'] },
    { role: 'to', aliases: ['to', '目标状态'] },
    { role: 'guard', aliases: ['guard', '守卫'], optional: true },
    { role: 'state', aliases: ['state', '状态'] },
    { role: 'submachine', aliases: ['submachine', '子机'], optional: true },
    { role: 'gateway', aliases: ['gateway', '网关'], optional: true },
  ],
  discovery:
    'no-tag scenario outline: examples header hitting at least 2 of the 3 families (from/event/to) is scoped in as a transition table; @states outlines are never sniffed as transition or decision tables',
  tags: [
    {
      tag: '@transitions',
      semantics: 'force validation even when no alias family matches (malformed tables fail E1)',
    },
    {
      tag: '@no-transitions',
      semantics: 'total escape even when the sniff matches (both tags together is an ERROR)',
    },
    {
      tag: '@flow',
      semantics:
        'mark a transition outline as flowchart dialect (graphKind=flow); apply E1/E2/E3 plus F3/F4 warnings, skip E4; conflicting with @no-transitions is ERROR',
    },
    {
      tag: '@states',
      semantics:
        'state-attribute outline (columns state|状态, optional submachine|子机 and gateway|网关); never sniffed as transition or decision table; maps nested machines and gateway flags onto states of transition outlines in the same rule',
    },
  ],
  gates: [
    'E1 structure & placeholder binding (columns from/event/to, runnable, steps bind <from>/<event>/<to>/<guard>)',
    'E2 determinism (same (from, event, guard) must not target different states)',
    'E3 reachability (every state reachable from the first-row from state)',
    'E4 deadlock/trap (with terminal states: reach one; without: return to the initial state; skipped for @flow)',
    'F3 (warning, @flow only) gateway out-degree < 2',
    'F4 (warning, @flow only) placeholder step name',
    'N1 dangling nested @req reference (missing req or target rule has no state machine)',
    'N2 nested machine cycle (report cycle path)',
    'N3 host state does not exist in the host machine',
    'N4 host state mapped more than once in the same rule',
    'N5 host state name is ambiguous across multiple machines in the same rule',
  ],
} as const;

export type TransitionDecision = 'conflict' | 'skip' | 'force' | 'sniff';

/**
 * Per-scenario scoping (r104), short-circuiting in order: both tags → ERROR,
 * @no-transitions → total escape, @transitions → forced entry, no tag →
 * shape sniff. Tags carry no leading `@` in the IR (parser strips it).
 */
export function resolveTransitionDecision(sc: ScenarioIR): TransitionDecision {
  if (sc.tags.includes(STATES_TAG) || isStatesOutline(sc)) return 'skip';
  const force = sc.tags.includes(FORCE_TRANSITIONS_TAG);
  const flow = sc.tags.includes(FORCE_FLOW_TAG);
  const escape = sc.tags.includes(ESCAPE_TRANSITIONS_TAG);
  if ((force || flow) && escape) return 'conflict';
  if (escape) return 'skip';
  if (force || flow) return 'force';
  return 'sniff';
}

function placeholderVariants(col: string): string[] {
  return [`<${col}>`, `<${col.toLowerCase()}>`];
}

function stepBindsPlaceholder(text: string, col: string): boolean {
  return placeholderVariants(col).some((v) => text.includes(v));
}

export function extractTransitions(sc: ScenarioIR): TransitionEdge[] {
  const transitions: TransitionEdge[] = [];
  for (const block of sc.examples ?? []) {
    const cols = resolveTransitionColumns(block.headers);
    if (!cols) continue;
    const fromIdx = block.headers.indexOf(cols.from);
    const eventIdx = block.headers.indexOf(cols.event);
    const toIdx = block.headers.indexOf(cols.to);
    const guardIdx = cols.guard === undefined ? -1 : block.headers.indexOf(cols.guard);
    for (const row of block.rows) {
      transitions.push({
        from: row[fromIdx] ?? '',
        event: row[eventIdx] ?? '',
        to: row[toIdx] ?? '',
        guard: guardIdx === -1 ? undefined : (row[guardIdx] ?? ''),
      });
    }
  }
  return transitions;
}

function distinctStates(transitions: readonly TransitionEdge[]): Set<string> {
  const states = new Set<string>();
  for (const t of transitions) {
    states.add(t.from);
    states.add(t.to);
  }
  return states;
}

function anchor(cap: string, rule: RuleIR): string {
  return `${cap}/transitions/${rule.reqId || rule.title}`;
}

/** E1–E4 for one transition outline; returns ERROR items only. */
export function validateTransitionScenario(
  cap: string,
  rule: RuleIR,
  sc: ScenarioIR,
): ValidationItem[] {
  const items: ValidationItem[] = [];
  const id = anchor(cap, rule);
  const push = (message: string): void => {
    items.push({ level: 'ERROR', id, message });
  };

  const transitions = extractTransitions(sc);
  const states = distinctStates(transitions);

  const cols =
    sc.examples?.map((ex) => resolveTransitionColumns(ex.headers)).find((c) => c !== null) ?? null;

  const e1Table =
    !sc.runnable ||
    !sc.examples ||
    sc.examples.length === 0 ||
    cols === null ||
    transitions.length < 1 ||
    transitions.some((t) => t.from === '' || t.event === '' || t.to === '') ||
    states.size < 2;

  if (e1Table) {
    push(
      `transition scenario \`${sc.name}\` requires a runnable non-empty Examples table with columns [from, event, to] and at least 2 distinct states`,
    );
    return items;
  }

  const given = sc.steps.find((s) => s.kind === 'given');
  const when = sc.steps.find((s) => s.kind === 'when');
  const then = sc.steps.find((s) => s.kind === 'then');
  const needsGuard = cols.guard !== undefined;
  const givenOk =
    given !== undefined &&
    stepBindsPlaceholder(given.text, cols.from) &&
    (!needsGuard ||
      stepBindsPlaceholder(given.text, cols.guard!) ||
      (when !== undefined && stepBindsPlaceholder(when.text, cols.guard!)));
  const whenOk = when !== undefined && stepBindsPlaceholder(when.text, cols.event);
  const thenOk = then !== undefined && stepBindsPlaceholder(then.text, cols.to);

  if (!givenOk || !whenOk || !thenOk) {
    push(
      `transition scenario \`${sc.name}\` steps must bind placeholders <from> in Given, <event> in When, and <to> in Then`,
    );
    return items;
  }

  const seen = new Set<string>();
  for (const t of transitions) {
    const key = `${t.from}\0${t.event}\0${t.guard ?? ''}`;
    if (seen.has(key)) {
      const guardPart = t.guard ? ` [${t.guard}]` : '';
      push(
        `non-deterministic or duplicate transition in \`${sc.name}\`: state \`${t.from}\` on event \`${t.event}\`${guardPart} has conflicting targets`,
      );
      return items;
    }
    seen.add(key);
  }

  const initial = transitions[0]?.from ?? '';

  const graph = createGraph();
  for (const s of states) addNode(graph, { id: s });
  let edgeSeq = 0;
  for (const t of transitions) {
    addEdge(graph, {
      id: `e${String(edgeSeq++)}`,
      sourceId: t.from,
      targetId: t.to,
    });
  }

  const reachable = new Set(
    [...genBFS(graph, initial)]
      .map((n) => (typeof n === 'object' && n !== null && 'id' in n ? String(n.id) : String(n)))
      .filter((nid) => nid !== ''),
  );
  const unreachable = [...states].filter((s) => !reachable.has(s));
  if (unreachable.length > 0) {
    push(
      `unreachable state(s) in transition table \`${sc.name}\` from initial state \`${initial}\`: ${unreachable.join(', ')}`,
    );
    return items;
  }

  const outTargets = new Map<string, Set<string>>();
  for (const t of transitions) {
    const set = outTargets.get(t.from) ?? new Set<string>();
    set.add(t.to);
    outTargets.set(t.from, set);
  }

  // E4 unified invariant (r104): with terminal states (out-degree 0) every
  // non-terminal state must reach one; without any terminal state (cyclic
  // machine) every state must be able to return to the initial state. E3 has
  // already guaranteed all states are reachable FROM the initial state.
  // @flow dialect skips E4 (flowchart F-series covers liveness via F1–F4).
  if (sc.tags.includes(FORCE_FLOW_TAG)) {
    return items;
  }

  const terminalStates = [...states].filter((s) => (outTargets.get(s)?.size ?? 0) === 0);

  if (terminalStates.length > 0) {
    const deadlocks = [...states].filter(
      (s) => !terminalStates.includes(s) && !terminalStates.some((term) => hasPath(graph, s, term)),
    );
    if (deadlocks.length > 0) {
      push(
        `deadlock state(s) in transition table \`${sc.name}\` (cannot reach any terminal state): ${deadlocks.join(', ')}`,
      );
      return items;
    }
  } else {
    const trapped = [...states].filter((s) => s !== initial && !hasPath(graph, s, initial));
    if (trapped.length > 0) {
      push(
        `trap state(s) in transition table \`${sc.name}\` (cannot return to the initial state \`${initial}\`): ${trapped.join(', ')}`,
      );
      return items;
    }
  }

  return items;
}

function validateStatesScenario(cap: string, rule: RuleIR, sc: ScenarioIR): ValidationItem[] {
  const items: ValidationItem[] = [];
  const id = anchor(cap, rule);
  const cols =
    sc.examples?.map((ex) => resolveStateColumns(ex.headers)).find((c) => c !== null) ?? null;
  if (!sc.runnable || !sc.examples || sc.examples.length === 0 || cols === null) {
    items.push({
      level: 'ERROR',
      id,
      message: `state-attribute scenario \`${sc.name}\` requires a runnable Examples table with a state|状态 column`,
    });
    return items;
  }

  const given = sc.steps.find((s) => s.kind === 'given');
  const then = sc.steps.find((s) => s.kind === 'then');
  const stateOk = given !== undefined && stepBindsPlaceholder(given.text, cols.state);
  const subOk =
    cols.submachine === undefined ||
    (then !== undefined && stepBindsPlaceholder(then.text, cols.submachine));
  if (!stateOk || !subOk) {
    items.push({
      level: 'ERROR',
      id,
      message: `state-attribute scenario \`${sc.name}\` steps must bind placeholders <state> in Given${cols.submachine !== undefined ? ' and <submachine> in Then' : ''}`,
    });
  }
  return items;
}

export function validateTransitionsForRule(cap: string, rule: RuleIR): ValidationItem[] {
  const items: ValidationItem[] = [];
  for (const sc of rule.scenarios) {
    if (sc.tags.includes(STATES_TAG) || isStatesOutline(sc)) {
      if (sc.tags.includes(STATES_TAG)) {
        items.push(...validateStatesScenario(cap, rule, sc));
      }
      continue;
    }
    const decision = resolveTransitionDecision(sc);
    if (decision === 'conflict') {
      const flow = sc.tags.includes(FORCE_FLOW_TAG);
      const force = sc.tags.includes(FORCE_TRANSITIONS_TAG);
      const pair =
        flow && !force ? '@flow and @no-transitions' : '@transitions and @no-transitions';
      items.push({
        level: 'ERROR',
        id: anchor(cap, rule),
        message: `scenario \`${sc.name}\` carries conflicting ${pair} tags — keep exactly one`,
      });
      continue;
    }
    // Escape is total: skip even malformed tables; force enters validation so
    // a malformed table fails E1 loudly.
    if (decision === 'skip') continue;
    if (decision === 'sniff' && !isTransitionOutline(sc)) continue;
    items.push(...validateTransitionScenario(cap, rule, sc));
  }
  return items;
}
