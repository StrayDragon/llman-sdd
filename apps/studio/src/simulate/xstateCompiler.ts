/**
 * XState v5 local compiler & native inspect microstep tracer (studio-web r148).
 * Strictly isolated inside apps/studio (never imported by packages/core).
 * Zero cloud relay — 100% deterministic local simulation with dynamic guard toggles.
 */
import type { StudioMachineIR } from '@llman-sdd/core/studio';
import { createActor, createMachine, type InspectionEvent } from 'xstate';

export interface SimulationStepRecord {
  index: number;
  event: string;
  fromUid: string;
  toUid: string;
  guard?: string;
}

export interface CompiledSimulationSession {
  currentStateUid: () => string;
  send: (eventType: string) => { transitioned: boolean; fromUid: string; toUid: string };
  availableTransitions: () => Array<{
    edgeUid: string;
    event: string;
    guard?: string;
    toUid: string;
    guardSatisfied: boolean;
  }>;
  setGuard: (guardName: string, value: boolean) => void;
  getGuards: () => Record<string, boolean>;
  getTrace: () => SimulationStepRecord[];
  stop: () => void;
}

/**
 * Compile a StudioMachineIR into a live XState v5 actor with native `inspect` microstep capture.
 */
export function createMachineSimulationSession(
  machine: StudioMachineIR,
  initialGuards: Record<string, boolean> = {},
): CompiledSimulationSession {
  const initialUid =
    machine.initialStateUid ?? machine.transitions[0]?.fromUid ?? machine.states[0]?.uid ?? 's1';
  const guardMap: Record<string, boolean> = { ...initialGuards };
  for (const t of machine.transitions) {
    if (t.guard && t.guard.trim() !== '' && guardMap[t.guard.trim()] === undefined) {
      guardMap[t.guard.trim()] = false;
    }
  }

  const statesConfig: Record<
    string,
    { on: Record<string, Array<{ target: string; guard?: () => boolean }>> }
  > = {};
  for (const s of machine.states) {
    statesConfig[s.uid] = { on: {} };
  }
  for (const t of machine.transitions) {
    const stateBucket = statesConfig[t.fromUid];
    if (!stateBucket) continue;
    const evList = stateBucket.on[t.event] ?? [];
    const guardName = t.guard?.trim();
    evList.push({
      target: t.toUid,
      ...(guardName ? { guard: () => guardMap[guardName] === true } : {}),
    });
    stateBucket.on[t.event] = evList;
  }

  const compiled = createMachine({
    id: machine.machineKey,
    initial: initialUid,
    states: statesConfig,
  });

  const trace: SimulationStepRecord[] = [];
  let lastStateUid = initialUid;
  let lastMicrostepCount = 0;

  const actor = createActor(compiled, {
    inspect: (inspectionEvent: InspectionEvent) => {
      if (inspectionEvent.type === '@xstate.microstep') {
        const prevUid = lastStateUid;
        const nextSnap = inspectionEvent.snapshot as { value?: unknown };
        const nextUid = typeof nextSnap.value === 'string' ? nextSnap.value : prevUid;
        const evType = inspectionEvent.event.type;
        if (evType !== 'xstate.init' && inspectionEvent._transitions.length > 0) {
          const matchedEdge = machine.transitions.find(
            (t) =>
              t.fromUid === prevUid &&
              t.event === evType &&
              t.toUid === nextUid &&
              (!t.guard || guardMap[t.guard.trim()] === true),
          );
          trace.push({
            index: trace.length + 1,
            event: evType,
            fromUid: prevUid,
            toUid: nextUid,
            ...(matchedEdge?.guard ? { guard: matchedEdge.guard } : {}),
          });
        }
        lastStateUid = nextUid;
      } else if (inspectionEvent.type === '@xstate.snapshot') {
        const snap = inspectionEvent.snapshot as { value?: unknown };
        if (typeof snap.value === 'string') {
          lastStateUid = snap.value;
        }
      }
    },
  });
  actor.start();

  return {
    currentStateUid: () => {
      const val = actor.getSnapshot().value;
      return typeof val === 'string' ? val : lastStateUid;
    },
    send: (eventType: string) => {
      const fromUid = String(actor.getSnapshot().value);
      lastMicrostepCount = trace.length;
      actor.send({ type: eventType });
      const toUid = String(actor.getSnapshot().value);
      const transitioned = trace.length > lastMicrostepCount;
      return { transitioned, fromUid, toUid };
    },
    availableTransitions: () => {
      const cur = String(actor.getSnapshot().value);
      return machine.transitions
        .filter((t) => t.fromUid === cur)
        .map((t) => {
          const g = t.guard?.trim();
          return {
            edgeUid: t.uid,
            event: t.event,
            ...(g ? { guard: g } : {}),
            toUid: t.toUid,
            guardSatisfied: !g || guardMap[g] === true,
          };
        });
    },
    setGuard: (guardName: string, value: boolean) => {
      guardMap[guardName] = value;
    },
    getGuards: () => ({ ...guardMap }),
    getTrace: () => [...trace],
    stop: () => actor.stop(),
  };
}
