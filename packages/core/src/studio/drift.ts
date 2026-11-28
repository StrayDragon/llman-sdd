/**
 * 0-Token Cross-Language Runtime Trace Reconciliation & `@llmanspec:` Anchor Slice Engine (studio-core r149).
 * 100% offline deterministic pure domain module — zero filesystem I/O, zero network, zero LLM calls.
 */
import { z } from 'zod';

import { specIdOf } from '../spec/ir.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';
import type { SpecEntry } from '../validation/validate.ts';
import { extractStudioMachines } from './extract.ts';
import type { RevisionOp, StudioMachineIR, StudioStateDoc } from './model.ts';
import { proposeRevision } from './revisions.ts';

export const runtimeTraceEventSchema = z.object({
  machine: z.string().trim().min(1, 'machine must be a non-empty string'),
  from: z.string().trim().min(1, 'from must be a non-empty string'),
  event: z.string().trim().min(1, 'event must be a non-empty string'),
  guard: z.string().optional(),
  to: z.string().trim().min(1, 'to must be a non-empty string'),
  ts: z.string().optional(),
});

export type RuntimeTraceEvent = z.infer<typeof runtimeTraceEventSchema>;

export interface ParsedRuntimeTraceEvent extends RuntimeTraceEvent {
  line: number;
}

export interface RuntimeTraceParseError {
  line: number;
  raw: string;
  message: string;
}

export interface ParseRuntimeTraceResult {
  events: ParsedRuntimeTraceEvent[];
  errors: RuntimeTraceParseError[];
}

export interface ShadowTransitionFinding {
  machineKey: string;
  from: string;
  event: string;
  guard?: string;
  to: string;
  count: number;
  sampleLines: number[];
}

export interface UncoveredTransitionFinding {
  machineKey: string;
  transitionUid: string;
  from: string;
  event: string;
  guard?: string;
  to: string;
}

export interface UnknownMachineFinding {
  machine: string;
  count: number;
  sampleLines: number[];
  reason: 'not_found' | 'ambiguous';
  candidates?: string[];
}

export interface RuntimeTraceReconcileResult {
  totalEvents: number;
  matchedEvents: number;
  shadowTransitions: ShadowTransitionFinding[];
  uncoveredTransitions: UncoveredTransitionFinding[];
  unknownMachines: UnknownMachineFinding[];
}

export interface DriftRevisionProposalDraft {
  machineKey: string;
  rationale: string;
  ops: RevisionOp[];
  shadowCount: number;
}

export interface LlmanspecAnchorMatch {
  file: string;
  line: number;
  kind: 'req' | 'machine';
  target: string;
  rawLine: string;
}

export interface UnifiedDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export interface ParsedDiffFile {
  file: string;
  hunks: UnifiedDiffHunk[];
}

export interface DriftDiffFileInput {
  file: string;
  content: string;
  hunks: readonly UnifiedDiffHunk[];
}

export interface DriftImpactedSpec {
  kind: 'rule' | 'machine';
  capability: string;
  reqId: string | null;
  machineKey?: string;
  title: string;
  sourceFile: string;
  excerpt: string;
}

export interface DriftMatchedFileSlice {
  file: string;
  anchors: LlmanspecAnchorMatch[];
  hunks: UnifiedDiffHunk[];
}

export interface DriftSlicePacket {
  sinceRef?: string;
  changedFileCount: number;
  matchedFiles: DriftMatchedFileSlice[];
  impactedSpecs: DriftImpactedSpec[];
  unanchoredFiles: string[];
}

function normGuard(g?: string): string {
  return (g ?? '').trim();
}

function transitionSignature(
  from: string,
  event: string,
  guard: string | undefined,
  to: string,
): string {
  return `${from.trim()}\u0000${event.trim()}\u0000${normGuard(guard)}\u0000${to.trim()}`;
}

/**
 * Parse a cross-language JSONL runtime trace string with strict per-line Zod validation.
 * Malformed JSON or missing required fields are reported with exact 1-based line numbers.
 */
export function parseRuntimeTraceJsonl(rawText: string): ParseRuntimeTraceResult {
  const events: ParsedRuntimeTraceEvent[] = [];
  const errors: RuntimeTraceParseError[] = [];
  const lines = rawText.split(/\r?\n/u);

  for (let idx = 0; idx < lines.length; idx += 1) {
    const raw = lines[idx] ?? '';
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const line = idx + 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      errors.push({
        line,
        raw,
        message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const checked = runtimeTraceEventSchema.safeParse(parsed);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      const field = issue?.path.join('.') || '<root>';
      errors.push({
        line,
        raw,
        message: `schema error at ${field}: ${issue?.message ?? 'invalid trace event'}`,
      });
      continue;
    }

    const g = normGuard(checked.data.guard);
    events.push({
      line,
      machine: checked.data.machine,
      from: checked.data.from,
      event: checked.data.event,
      ...(g !== '' ? { guard: g } : {}),
      to: checked.data.to,
      ...(checked.data.ts !== undefined ? { ts: checked.data.ts } : {}),
    });
  }

  return { events, errors };
}

function resolveTraceMachine(
  identifier: string,
  machines: readonly StudioMachineIR[],
): { machine: StudioMachineIR } | { reason: 'not_found' | 'ambiguous'; candidates?: string[] } {
  const target = identifier.trim();
  const exact = machines.find((m) => m.machineKey === target);
  if (exact) return { machine: exact };

  const shortMatches = machines.filter((m) => {
    const capReq = m.reqId ? `${m.capability}/${m.reqId}` : null;
    return (
      m.capability === target ||
      m.scenarioName === target ||
      m.ruleTitle === target ||
      (capReq !== null && capReq === target)
    );
  });

  if (shortMatches.length === 1) {
    return { machine: shortMatches[0]! };
  }
  if (shortMatches.length > 1) {
    return {
      reason: 'ambiguous',
      candidates: shortMatches.map((m) => m.machineKey),
    };
  }
  return { reason: 'not_found' };
}

/**
 * 0-Token deterministic reconciliation between declared StudioMachineIR[] and observed trace events.
 */
export function reconcileRuntimeTrace(
  machines: readonly StudioMachineIR[],
  events: readonly ParsedRuntimeTraceEvent[],
): RuntimeTraceReconcileResult {
  const declaredByMachine = new Map<string, Map<string, string>>();
  const stateNameByMachine = new Map<string, Map<string, string>>();

  for (const m of machines) {
    const names = new Map<string, string>();
    for (const st of m.states) names.set(st.uid, st.name);
    stateNameByMachine.set(m.machineKey, names);

    const sigs = new Map<string, string>();
    for (const tr of m.transitions) {
      const fromName = names.get(tr.fromUid) ?? tr.fromUid;
      const toName = names.get(tr.toUid) ?? tr.toUid;
      sigs.set(transitionSignature(fromName, tr.event, tr.guard, toName), tr.uid);
    }
    declaredByMachine.set(m.machineKey, sigs);
  }

  const coveredUids = new Set<string>();
  const shadowMap = new Map<string, ShadowTransitionFinding>();
  const unknownMap = new Map<string, UnknownMachineFinding>();
  let matchedEvents = 0;

  for (const ev of events) {
    const resolved = resolveTraceMachine(ev.machine, machines);
    if (!('machine' in resolved)) {
      const existing = unknownMap.get(ev.machine);
      if (existing) {
        existing.count += 1;
        if (existing.sampleLines.length < 5) existing.sampleLines.push(ev.line);
      } else {
        unknownMap.set(ev.machine, {
          machine: ev.machine,
          count: 1,
          sampleLines: [ev.line],
          reason: resolved.reason,
          ...(resolved.candidates ? { candidates: resolved.candidates } : {}),
        });
      }
      continue;
    }

    const machineKey = resolved.machine.machineKey;
    const sigMap = declaredByMachine.get(machineKey)!;
    const sig = transitionSignature(ev.from, ev.event, ev.guard, ev.to);
    const matchedUid = sigMap.get(sig);

    if (matchedUid !== undefined) {
      matchedEvents += 1;
      coveredUids.add(`${machineKey}\u0000${matchedUid}`);
      continue;
    }

    const shadowKey = `${machineKey}\u0000${sig}`;
    const existingShadow = shadowMap.get(shadowKey);
    if (existingShadow) {
      existingShadow.count += 1;
      if (existingShadow.sampleLines.length < 5) existingShadow.sampleLines.push(ev.line);
    } else {
      const g = normGuard(ev.guard);
      shadowMap.set(shadowKey, {
        machineKey,
        from: ev.from,
        event: ev.event,
        ...(g !== '' ? { guard: g } : {}),
        to: ev.to,
        count: 1,
        sampleLines: [ev.line],
      });
    }
  }

  const uncoveredTransitions: UncoveredTransitionFinding[] = [];
  for (const m of machines) {
    const names = stateNameByMachine.get(m.machineKey)!;
    for (const tr of m.transitions) {
      if (!coveredUids.has(`${m.machineKey}\u0000${tr.uid}`)) {
        uncoveredTransitions.push({
          machineKey: m.machineKey,
          transitionUid: tr.uid,
          from: names.get(tr.fromUid) ?? tr.fromUid,
          event: tr.event,
          ...(tr.guard !== undefined && tr.guard.trim() !== '' ? { guard: tr.guard } : {}),
          to: names.get(tr.toUid) ?? tr.toUid,
        });
      }
    }
  }

  return {
    totalEvents: events.length,
    matchedEvents,
    shadowTransitions: Array.from(shadowMap.values()),
    uncoveredTransitions,
    unknownMachines: Array.from(unknownMap.values()),
  };
}

/**
 * Convert detected shadowTransitions into structured non-destructive RevisionOp[] drafts
 * suitable for `proposeRevision(..., { source: 'drift-trace' })`.
 */
export function buildDriftRevisionProposals(
  machinesByKey: Readonly<Record<string, StudioMachineIR | null | undefined>>,
  shadowTransitions: readonly ShadowTransitionFinding[],
): DriftRevisionProposalDraft[] {
  const byMachine = new Map<string, ShadowTransitionFinding[]>();
  for (const sh of shadowTransitions) {
    const list = byMachine.get(sh.machineKey) ?? [];
    list.push(sh);
    byMachine.set(sh.machineKey, list);
  }

  const drafts: DriftRevisionProposalDraft[] = [];
  for (const [machineKey, list] of byMachine.entries()) {
    const current = machinesByKey[machineKey];
    const existingNames = new Set((current?.states ?? []).map((s) => s.name));
    const addedNames = new Set<string>();
    const ops: RevisionOp[] = [];
    const summaryParts: string[] = [];

    for (const sh of list) {
      if (!existingNames.has(sh.from) && !addedNames.has(sh.from)) {
        addedNames.add(sh.from);
        ops.push({ op: 'add_state', name: sh.from });
      }
      if (!existingNames.has(sh.to) && !addedNames.has(sh.to)) {
        addedNames.add(sh.to);
        ops.push({ op: 'add_state', name: sh.to });
      }
      ops.push({
        op: 'add_transition',
        from: sh.from,
        event: sh.event,
        ...(sh.guard !== undefined && sh.guard !== '' ? { guard: sh.guard } : {}),
        to: sh.to,
      });
      const guardSuffix = sh.guard ? ` [${sh.guard}]` : '';
      const lineStr = sh.sampleLines.map((n) => `L${String(n)}`).join(',');
      summaryParts.push(
        `${sh.from} --[${sh.event}${guardSuffix}]--> ${sh.to} (x${String(sh.count)}, ${lineStr})`,
      );
    }

    drafts.push({
      machineKey,
      shadowCount: list.length,
      ops,
      rationale: `逻辑漂移校准：代码运行轨迹观测到 ${String(list.length)} 条未登记状态转移：${summaryParts.join('；')}`,
    });
  }

  return drafts;
}

/**
 * Append non-destructive `source: 'drift-trace'` pending revision proposals to a StudioStateDoc.
 * Deduplicates identical pending drift-trace proposals so repeated runs stay idempotent.
 */
export function applyDriftProposalsToStateDoc(
  doc: StudioStateDoc,
  shadowTransitions: readonly ShadowTransitionFinding[],
  createdAt: string,
): { doc: StudioStateDoc; addedProposalIds: string[] } {
  const machinesByKey: Record<string, StudioMachineIR | null> = {};
  for (const [k, d] of Object.entries(doc.machines)) {
    machinesByKey[k] = d.current ?? d.baseline;
  }
  const proposalDrafts = buildDriftRevisionProposals(machinesByKey, shadowTransitions);
  let nextDoc = doc;
  const addedProposalIds: string[] = [];

  for (const pd of proposalDrafts) {
    if (!nextDoc.machines[pd.machineKey]) continue;
    const opsKey = JSON.stringify(pd.ops);
    const duplicate = nextDoc.revisions.find(
      (r) =>
        r.status === 'pending' &&
        r.source === 'drift-trace' &&
        r.machineKey === pd.machineKey &&
        JSON.stringify(r.ops) === opsKey,
    );
    if (duplicate) continue;

    nextDoc = proposeRevision(nextDoc, {
      machineKey: pd.machineKey,
      rationale: pd.rationale,
      ops: pd.ops,
      createdAt,
      source: 'drift-trace',
    });
    const added = nextDoc.revisions.at(-1);
    if (added) addedProposalIds.push(added.id);
  }

  return { doc: nextDoc, addedProposalIds };
}

const COMMENT_PREFIX_RE = /(?:\/\/|\/\*|\*|#|--|<!--)/u;
const MACHINE_ANCHOR_RE = /@llmanspec:machine:([^\s*#;,)\]]+)/gu;
const REQ_ANCHOR_RE = /@llmanspec:(?!machine:)([a-zA-Z0-9_-]+)/gu;

/**
 * Scan cross-language comment anchors (`@llmanspec:<reqId>` and `@llmanspec:machine:<machineKey>`)
 * across TS/JS, Rust, Python, Shell, SQL, and HTML comment styles. Strictly ignores bare `llman`.
 */
export function scanLlmanspecAnchors(filePath: string, content: string): LlmanspecAnchorMatch[] {
  const matches: LlmanspecAnchorMatch[] = [];
  const lines = content.split(/\r?\n/u);

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? '';
    const markerIdx = rawLine.indexOf('@llmanspec:');
    if (markerIdx === -1) continue;
    const before = rawLine.slice(0, markerIdx);
    if (!COMMENT_PREFIX_RE.test(before)) continue;

    const line = i + 1;
    const commentSlice = rawLine.slice(markerIdx);

    for (const m of commentSlice.matchAll(MACHINE_ANCHOR_RE)) {
      const target = m[1]?.trim();
      if (target) {
        matches.push({ file: filePath, line, kind: 'machine', target, rawLine });
      }
    }
    for (const m of commentSlice.matchAll(REQ_ANCHOR_RE)) {
      const target = m[1]?.trim();
      if (target) {
        matches.push({ file: filePath, line, kind: 'req', target, rawLine });
      }
    }
  }

  return matches;
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;

/**
 * Parse unified `git diff` text into structured per-file hunks (0-Token pure parser).
 */
export function parseUnifiedDiffHunks(diffText: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  let currentFile: ParsedDiffFile | null = null;
  let currentHunk: UnifiedDiffHunk | null = null;

  for (const line of diffText.split(/\r?\n/u)) {
    if (line.startsWith('diff --git ')) {
      currentHunk = null;
      const m = /^diff --git a\/(.+?) b\/(.+)$/u.exec(line);
      if (m?.[2]) {
        currentFile = { file: m[2], hunks: [] };
        files.push(currentFile);
      } else {
        currentFile = null;
      }
      continue;
    }
    if (line.startsWith('+++ b/')) {
      const nextName = line.slice('+++ b/'.length).trim();
      if (currentFile) {
        currentFile.file = nextName;
      } else {
        currentFile = { file: nextName, hunks: [] };
        files.push(currentFile);
      }
      continue;
    }
    if (line.startsWith('@@ ')) {
      const hm = HUNK_HEADER_RE.exec(line);
      if (hm && currentFile) {
        currentHunk = {
          oldStart: Number(hm[1]),
          oldLines: hm[2] !== undefined ? Number(hm[2]) : 1,
          newStart: Number(hm[3]),
          newLines: hm[4] !== undefined ? Number(hm[4]) : 1,
          header: line,
          lines: [line],
        };
        currentFile.hunks.push(currentHunk);
      }
      continue;
    }
    if (
      currentHunk &&
      (line.startsWith('+') ||
        line.startsWith('-') ||
        line.startsWith(' ') ||
        line.startsWith('\\'))
    ) {
      currentHunk.lines.push(line);
    }
  }

  return files;
}

function hunkTouchesAnchor(hunk: UnifiedDiffHunk, anchorLine: number, proximity: number): boolean {
  const start = Math.max(1, hunk.newStart - proximity);
  const end = hunk.newStart + Math.max(hunk.newLines, 1) - 1 + proximity;
  return anchorLine >= start && anchorLine <= end;
}

/**
 * Build a minimal, high-signal 0-Token `DriftSlicePacket` by intersecting changed diff hunks
 * with `@llmanspec:` comment anchors and resolving ONLY the impacted rules/machines from specs.
 */
export function buildDriftSlicePacket(input: {
  diffFiles: readonly DriftDiffFileInput[];
  specEntries: readonly SpecEntry[];
  sinceRef?: string;
  proximityLines?: number;
}): DriftSlicePacket {
  const proximity = input.proximityLines ?? 25;
  const registry = buildReqRegistry(input.specEntries);
  const extractedMachines = extractStudioMachines(input.specEntries);
  const machines = extractedMachines.map((m) => m.machine);

  const matchedFiles: DriftMatchedFileSlice[] = [];
  const unanchoredFiles: string[] = [];
  const impactedByKey = new Map<string, DriftImpactedSpec>();

  for (const df of input.diffFiles) {
    const fileAnchors = scanLlmanspecAnchors(df.file, df.content);
    if (fileAnchors.length === 0) {
      unanchoredFiles.push(df.file);
      continue;
    }

    const hitAnchors: LlmanspecAnchorMatch[] = [];
    const hitHunks = new Set<UnifiedDiffHunk>();

    for (const anchor of fileAnchors) {
      let matchedAnyHunk = false;
      for (const hunk of df.hunks) {
        if (hunkTouchesAnchor(hunk, anchor.line, proximity)) {
          matchedAnyHunk = true;
          hitHunks.add(hunk);
        }
      }
      if (matchedAnyHunk) {
        hitAnchors.push(anchor);
      }
    }

    if (hitAnchors.length === 0) {
      unanchoredFiles.push(df.file);
      continue;
    }

    matchedFiles.push({
      file: df.file,
      anchors: hitAnchors,
      hunks: Array.from(hitHunks),
    });

    for (const anchor of hitAnchors) {
      if (anchor.kind === 'req') {
        const occs = registry.byId.get(anchor.target) ?? [];
        for (const occ of occs) {
          const entry = input.specEntries.find((e) => e.fileName === occ.fileName);
          if (!entry) continue;
          const capId = specIdOf(entry);
          const rule = entry.doc.rules.find((r) => r.reqId === anchor.target);
          if (!rule) continue;
          const key = `rule:${capId}:${anchor.target}`;
          if (!impactedByKey.has(key)) {
            impactedByKey.set(key, {
              kind: 'rule',
              capability: capId,
              reqId: anchor.target,
              title: rule.title,
              sourceFile: entry.fileName,
              excerpt: `${rule.title}\n${rule.description}`.trim(),
            });
          }
        }
      } else {
        const resolved = resolveTraceMachine(anchor.target, machines);
        if ('machine' in resolved) {
          const m = resolved.machine;
          const draft = extractedMachines.find((x) => x.machine.machineKey === m.machineKey);
          const key = `machine:${m.machineKey}`;
          if (!impactedByKey.has(key)) {
            const stateNames = new Map(m.states.map((s) => [s.uid, s.name]));
            const edgeSummary = m.transitions
              .map((t) => {
                const fn = stateNames.get(t.fromUid) ?? t.fromUid;
                const tn = stateNames.get(t.toUid) ?? t.toUid;
                const gd = t.guard ? ` [${t.guard}]` : '';
                return `${fn} --[${t.event}${gd}]--> ${tn}`;
              })
              .join('\n');
            impactedByKey.set(key, {
              kind: 'machine',
              capability: m.capability,
              reqId: m.reqId,
              machineKey: m.machineKey,
              title: `${m.ruleTitle} / ${m.scenarioName}`,
              sourceFile: draft?.draft.sourceFile ?? '',
              excerpt: edgeSummary,
            });
          }
        }
      }
    }
  }

  return {
    ...(input.sinceRef !== undefined ? { sinceRef: input.sinceRef } : {}),
    changedFileCount: input.diffFiles.length,
    matchedFiles,
    impactedSpecs: Array.from(impactedByKey.values()),
    unanchoredFiles,
  };
}
