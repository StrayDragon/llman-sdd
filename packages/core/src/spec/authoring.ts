/**
 * Programming-style spec authoring helpers (r41-r43, native v2):
 * append `规则:` blocks / nested scenarios, resolve req ids, dedupe conflicts.
 * Appends are text-level so existing file content (formatting, comments)
 * stays untouched.
 */

import type { CapabilityDoc, RuleIR } from './ir.ts';
import { specIdOf } from './ir.ts';
import { BLOCK_KEYWORD_LINE_RE, officialKeywordsOrEn } from './keywords.ts';

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

interface KeywordSet {
  rule: string;
  scenario: string;
  given: string;
  when: string;
  thenText: string;
}

/**
 * Dialect of the target file: an explicit `# language:` header wins
 * (official matchers auto-switch on it); headerless zh content parses via
 * the zh-CN fallback chain (r7), anything else is en.
 */
function dialectOf(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim() !== '');
  const header = firstLine?.match(/^#\s*language:\s*(\S+)\s*$/u)?.[1];
  if (header !== undefined) return header;
  return content.includes('功能:') ? 'zh-CN' : 'en';
}

function keywordsOf(content: string): KeywordSet {
  const kw = officialKeywordsOrEn(dialectOf(content));
  return {
    rule: kw.rule,
    scenario: kw.scenario,
    given: kw.given,
    when: kw.when,
    thenText: kw.thenText,
  };
}

function findRule(
  entries: readonly SpecEntryLike[],
  reqId: string,
): { entry: SpecEntryLike; rule: RuleIR } | null {
  for (const entry of entries) {
    const rule = entry.doc.rules.find((r) => r.reqId === reqId);
    if (rule !== undefined) return { entry, rule };
  }
  return null;
}

/** Requirement handles (`@req` on `规则:` headers) participate in the dedupe registry. */
export function ruleReqIds(entries: readonly SpecEntryLike[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const rule of entry.doc.rules) {
      if (rule.reqId !== '') ids.add(rule.reqId);
    }
  }
  return ids;
}

export function allReqIds(entries: readonly SpecEntryLike[]): Set<string> {
  return ruleReqIds(entries);
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

/** Append a `规则:` block (with @req handle) to the resolved target spec (r41). */
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
  const kw = keywordsOf(io.readText(path));
  const desc = opts.statement
    .split('\n')
    .map((l) => `    ${l.trim()}`)
    .join('\n');
  const block = `\n  @req:${opts.reqId}\n  ${kw.rule}: ${opts.title}\n${desc}\n`;
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

/**
 * Insert a nested `场景:` under the target rule's block (r42). Finds the
 * rule block boundary in the raw text (next 2-space top-level element) and
 * inserts the scenario before it, keeping existing formatting untouched.
 */
export function addScenario(
  io: WriteIo,
  specsRoot: string,
  entries: readonly SpecEntryLike[],
  opts: AddScenarioOpts,
): string {
  const path = resolveWriteTarget(io, specsRoot, opts.capability, entries);
  if (!io.exists(path)) throw new AuthoringError(`spec not found: ${path}`);
  const found = findRule(entries, opts.reqId);
  if (found === null) throw new AuthoringError(`req id not found: ${opts.reqId}`);
  const content = io.readText(path);
  const lines = content.split('\n');
  const tagIdx = lines.findIndex((l) => l.trim() === `@req:${opts.reqId}`);
  if (tagIdx === -1) throw new AuthoringError(`req id not found in file: ${opts.reqId}`);
  // block end = first line after the tag's own rule header at 2-space top-level
  // indent that is a tag line or an official block keyword line (2-space +
  // keyword immediately, any official dialect). The rule header directly
  // following the tag opens the block, so the scan starts after it — otherwise
  // the header itself is mistaken for the boundary and the scenario is
  // inserted before the rule line (broken output).
  let end = lines.length;
  for (let i = tagIdx + 2; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (l.startsWith('  @') || BLOCK_KEYWORD_LINE_RE.test(l)) {
      end = i;
      break;
    }
  }
  const kw = keywordsOf(content);
  const givenLine =
    opts.given !== undefined && opts.given !== '' ? `      ${kw.given} ${opts.given}\n` : '';
  const scenarioBlock =
    `    ${kw.scenario}: ${opts.scenarioId}\n` +
    `${givenLine}      ${kw.when} ${opts.when}\n      ${kw.thenText} ${opts.thenText}\n`;
  // insert with a leading blank separator so the file stays readable
  lines.splice(end, 0, '', scenarioBlock.trimEnd());
  io.writeText(path, lines.join('\n'));
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
  const found = findRule(entries, reqId);
  if (found === null) return null;
  const { entry, rule } = found;
  const harness = rule.scenarios.map((s) => `${entry.fileName}:${s.name}`);
  return {
    reqId,
    capability: specIdOf(entry),
    title: rule.title,
    statement: rule.description,
    harness,
  };
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
