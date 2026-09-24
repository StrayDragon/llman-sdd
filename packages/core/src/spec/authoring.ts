/**
 * Programming-style spec authoring helpers (r41-r43, v1 parity):
 * append rules / acceptance scenarios, resolve req ids, dedupe conflicts.
 * Appends are text-level so existing file content (formatting, comments)
 * stays untouched.
 */

import type { CapabilityDoc } from './ir.ts';
import { MUST_WORD_RE, MUST_WORD_TERMS, specIdOf } from './ir.ts';

export class AuthoringError extends Error {}

export interface SpecEntryLike {
  fileName: string;
  doc: CapabilityDoc;
}

export interface WriteIo {
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, content: string): void;
}

function keywordsOf(content: string): {
  scenario: string;
  given: string;
  when: string;
  thenText: string;
} {
  return content.includes('功能:')
    ? { scenario: '场景', given: '假如', when: '当', thenText: '那么' }
    : { scenario: 'Scenario', given: 'Given', when: 'When', thenText: 'Then' };
}

/**
 * r41 caliber = r9 caliber: MUST_WORD_RE (built from MUST_WORD_TERMS) with
 * word boundaries — `MUSTARD` must NOT count as a hit.
 */
function assertRuleWording(statement: string): void {
  if (!MUST_WORD_RE.test(statement)) {
    throw new AuthoringError(
      `statement must contain a rule keyword (${MUST_WORD_TERMS.join('/')}): ${statement}`,
    );
  }
}

function findReq(
  entries: readonly SpecEntryLike[],
  reqId: string,
): { entry: SpecEntryLike; scenarioName: string; statement: string } | null {
  for (const entry of entries) {
    for (const scenario of entry.doc.scenarios) {
      if (scenario.reqIds.includes(reqId) && scenario.classification === 'human') {
        return { entry, scenarioName: scenario.name, statement: scenario.statement };
      }
    }
  }
  return null;
}

/** v1 parity: only @human (rule) req ids participate in the dedupe registry. */
export function ruleReqIds(entries: readonly SpecEntryLike[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const scenario of entry.doc.scenarios) {
      if (scenario.classification === 'human') {
        for (const id of scenario.reqIds) ids.add(id);
      }
    }
  }
  return ids;
}

export function allReqIds(entries: readonly SpecEntryLike[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const scenario of entry.doc.scenarios) {
      for (const id of scenario.reqIds) ids.add(id);
    }
  }
  return ids;
}

export interface AddReqOpts {
  capability: string;
  reqId: string;
  title: string;
  statement: string;
}

/**
 * Single write-target caliber (matches the spec show read side): the flat
 * `specs/<capability>.feature` wins when present, else the discovered entry
 * whose specId equals the capability exactly (covers directory-style
 * `<capability>/<capability>.feature`); the flat path is returned unchanged
 * when neither exists so callers raise their usual not-found error.
 */
export function resolveWriteTarget(
  io: WriteIo,
  specsRoot: string,
  capability: string,
  entries: readonly SpecEntryLike[],
): string {
  const flat = `${specsRoot}/${capability}.feature`;
  if (io.exists(flat)) return flat;
  const hit = entries.find((entry) => specIdOf(entry) === capability);
  return hit !== undefined ? hit.fileName : flat;
}

/** Append `@req:<id> @human` rule scenario to the resolved target spec (r41). */
export function addReq(
  io: WriteIo,
  specsRoot: string,
  entries: readonly SpecEntryLike[],
  opts: AddReqOpts,
): string {
  const path = resolveWriteTarget(io, specsRoot, opts.capability, entries);
  if (!io.exists(path)) throw new AuthoringError(`spec not found: ${path}`);
  if (allReqIds(entries).has(opts.reqId)) {
    throw new AuthoringError(`req id already in use: ${opts.reqId}`);
  }
  assertRuleWording(opts.statement);
  const kw = keywordsOf(io.readText(path));
  const block = `\n  @req:${opts.reqId} @human\n  ${kw.scenario}: ${opts.title}\n    ${opts.statement}\n`;
  io.writeText(path, `${io.readText(path).replace(/\n+$/u, '')}${block}`);
  return path;
}

export interface AddScenarioOpts {
  capability: string;
  reqId: string;
  scenarioId: string;
  given?: string;
  when: string;
  thenText: string;
}

/** Append `@req:<id> @executable` acceptance scenario to the resolved target (r42). */
export function addScenario(
  io: WriteIo,
  specsRoot: string,
  entries: readonly SpecEntryLike[],
  opts: AddScenarioOpts,
): string {
  const path = resolveWriteTarget(io, specsRoot, opts.capability, entries);
  if (!io.exists(path)) throw new AuthoringError(`spec not found: ${path}`);
  if (findReq(entries, opts.reqId) === null) {
    throw new AuthoringError(`req id not found: ${opts.reqId}`);
  }
  const kw = keywordsOf(io.readText(path));
  const givenLine =
    opts.given !== undefined && opts.given !== '' ? `    ${kw.given} ${opts.given}\n` : '';
  const block =
    `\n  @req:${opts.reqId} @executable\n  ${kw.scenario}: ${opts.scenarioId}\n` +
    `${givenLine}    ${kw.when} ${opts.when}\n    ${kw.thenText} ${opts.thenText}\n`;
  io.writeText(path, `${io.readText(path).replace(/\n+$/u, '')}${block}`);
  return path;
}

export interface ResolvedReq {
  reqId: string;
  capability: string;
  title: string;
  statement: string;
  harness: string[];
}

/** Resolve an rN to capability/statement plus bound harness scenarios (r43). */
export function resolveReq(entries: readonly SpecEntryLike[], reqId: string): ResolvedReq | null {
  const rule = findReq(entries, reqId);
  if (rule === null) return null;
  const capability = specIdOf(rule.entry);
  const harness: string[] = [];
  for (const entry of entries) {
    for (const scenario of entry.doc.scenarios) {
      if (scenario.classification === 'executable' && scenario.reqIds.includes(reqId)) {
        harness.push(`${entry.fileName}:${scenario.name}`);
      }
    }
  }
  return { reqId, capability, title: rule.scenarioName, statement: rule.statement, harness };
}

export interface DedupePlanItem {
  reqId: string;
  keepFile: string;
  remapFile: string;
  newReqId: string;
}

/**
 * Plan (and optionally apply) a re-map of globally duplicated rN ids: the
 * first file keeps the id, later files get the next free id (r43). `apply:
 * false` (`--dry-run`) returns the plan without writing anything.
 */
export function planDedupe(
  entries: readonly SpecEntryLike[],
  io: WriteIo,
  specsRoot: string,
  duplicates: readonly { reqId: string; files: string[] }[],
  opts: { apply?: boolean } = {},
): DedupePlanItem[] {
  const used = ruleReqIds(entries);
  let next = 1;
  const fresh = (): string => {
    while (used.has(`r${String(next)}`)) next += 1;
    used.add(`r${String(next)}`);
    return `r${String(next)}`;
  };
  const plan: DedupePlanItem[] = [];
  for (const dup of duplicates) {
    const [keep, ...rest] = dup.files;
    for (const remapFile of rest) {
      const newReqId = fresh();
      if (keep !== undefined) {
        plan.push({ reqId: dup.reqId, keepFile: keep, remapFile, newReqId });
      }
    }
  }
  if (opts.apply === false) return plan;
  for (const item of plan) {
    // registry duplicates carry bare file names; accept already-rooted paths too
    const path = item.remapFile.startsWith(`${specsRoot}/`)
      ? item.remapFile
      : `${specsRoot}/${item.remapFile}`;
    const content = io.readText(path);
    io.writeText(path, content.replaceAll(`@req:${item.reqId}`, `@req:${item.newReqId}`));
  }
  return plan;
}
