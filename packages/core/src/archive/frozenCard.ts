/**
 * Frozen-change relationship-index card contract (review-freeze capability,
 * r24/r25): `freeze` replaces a dated archive dir with a flat card
 * `<YYYY-MM-DD>-<id>.yaml` whose content carries only the change's `title`
 * and `depends_on` — a human/agent readable navigation index. id and date are
 * implied by the file name; bodies live in the 7z cold backup. Cards are the
 * authoritative record that a change is in the cold backup.
 *
 * The card is a single-document plain YAML file (no `---` fences — standard
 * single-doc parsers must accept it). Reading `depends_on` from a card is
 * dual-format (parseDeps in report/graph): fenced cards written by
 * predecessors keep working; this writer only produces the fenced-free form.
 * Title source: frontmatter `title` wins when non-empty, else the proposal H1
 * (legacy archive dirs).
 *
 * Depends_on *extraction* stays dependency-free: it recognizes single-line
 * flow `[a, b]`, block `- item` lists and multi-line flow blocks, then
 * normalizes to a single-line flow array so `parseDeps` reads it unchanged.
 * Anything unparseable degrades to `depends_on: []` (never blocks the freeze).
 * The r121 normalizer is the one place that consults the `yaml` package — it
 * must prove the stripped body is a genuine single document before rewriting.
 *
 * Pure string logic — all filesystem effects live in freeze.ts (FreezeIo).
 */

import { parseDocument } from 'yaml';

import { datedCardIdOf } from '../util/datedId.ts';

export const FROZEN_CARD_EXT = '.yaml';

/** `2026-01-01-old` → `2026-01-01-old.yaml` */
export function frozenCardName(datedId: string): string {
  return `${datedId}${FROZEN_CARD_EXT}`;
}

/** id for a card filename (`2026-01-01-old.yaml` → `old`); null when not a card. */
export function frozenCardIdOf(name: string): string | null {
  return datedCardIdOf(name, '.yaml');
}

export function isFrozenCard(name: string): boolean {
  return frozenCardIdOf(name) !== null;
}

function escapeYamlScalar(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/** Normalize a flow-list inner string (comma-separated, quotes stripped). */
function splitFlowItems(inner: string): string[] {
  const out: string[] = [];
  for (const raw of inner.split(',')) {
    const item = raw.trim().replaceAll(/^['"]|['"]$/gu, '');
    if (item !== '') out.push(item);
  }
  return out;
}

function toFlow(items: string[]): string {
  return items.length === 0 ? 'depends_on: []' : `depends_on: [${items.join(', ')}]`;
}

/**
 * Extract `depends_on` from a proposal frontmatter block. Falls back to
 * `depends_on: []` when absent/empty/unparseable — a malformed dependency list
 * never breaks the freeze.
 */
export function extractDependsOn(frontmatter: string): string {
  const lines = frontmatter.split('\n');
  const flowIdx = lines.findIndex((l) => /^depends_on\s*:\s*\[/u.test(l));
  if (flowIdx !== -1) {
    // Single-line flow `depends_on: [a, b]` (may span lines).
    let acc = (lines[flowIdx] ?? '').replace(/^depends_on\s*:/u, '').trim();
    let j = flowIdx;
    while (!/\]\s*$/u.test(acc) && j < lines.length - 1) {
      j++;
      acc += ` ${(lines[j] ?? '').trim()}`;
    }
    const inner = acc.replace(/^\[/u, '').replace(/\]\s*/u, '');
    return toFlow(splitFlowItems(inner));
  }
  const blockIdx = lines.findIndex((l) => /^depends_on\s*:\s*$/u.test(l));
  if (blockIdx !== -1) {
    // Block list `- a` lines.
    const items: string[] = [];
    for (const l of lines.slice(blockIdx + 1)) {
      const m = l.match(/^\s*-\s+(\S+)/u);
      if (m?.[1]) items.push(m[1].replaceAll(/['"]/gu, ''));
      // multi-line flow handled below
      else if (/^\s*\[/u.test(l)) break;
      else if (l.trim() !== '') break;
    }
    if (items.length > 0) return toFlow(items);
    // Multi-line flow `[\n a,\n b\n ]`.
    let acc = lines
      .slice(blockIdx + 1)
      .join(' ')
      .replace(/^[^[]*\[/u, '');
    acc = (acc.split(']')[0] ?? '').trim();
    if (acc !== '') return toFlow(splitFlowItems(acc));
    return 'depends_on: []';
  }
  return 'depends_on: []';
}

/** Compose a relationship-index card: single-document YAML, `title` + `depends_on`. */
export function composeFrozenCard(title: string, frontmatter: string): string {
  const dependsOn = extractDependsOn(frontmatter);
  return [`title: "${escapeYamlScalar(title)}"`, dependsOn].join('\n') + '\n';
}

/**
 * r121: fence-stripping normalizer for legacy cards. Predecessor-era cards
 * open and close with a standalone `---` line, which makes them a *multi*-
 * document YAML stream — generic single-document validators (pre-commit's
 * `check-yaml` by default) reject them. Returns the fence-free text, or null
 * when the input is not a plain fenced card.
 *
 * Conservative by construction — a miss is fine, a false rewrite is not:
 *   - first and last non-empty lines must each be exactly `---` (a stray `---`
 *     inside a scalar value must never trigger a rewrite);
 *   - the stripped body must parse as exactly one YAML document;
 *   - that document's keys must be a subset of `title` / `depends_on`.
 * A card already in the fence-free form returns null (idempotent by contract).
 */
export function unfenceFrozenCard(source: string): string | null {
  const lines = source.split('\n');
  // Trailing newline yields a final '' element; strip it so line indexes point
  // at real content.
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  if (lines.length < 3) return null;
  const isFence = (line: string | undefined): boolean =>
    (line ?? '').replace(/\s+$/u, '') === '---';
  if (!isFence(lines[0]) || !isFence(lines[lines.length - 1])) return null;
  // Normalize to LF while stripping: a lone trailing \r is not a YAML line
  // break, so a CRLF card would otherwise fail the single-document parse.
  const body = lines
    .slice(1, -1)
    .map((line) => line.replace(/\r$/u, ''))
    .join('\n');
  if (body.trim() === '') return null;
  let parsed: unknown;
  try {
    const doc = parseDocument(body);
    if (doc.errors.length > 0) return null;
    parsed = doc.toJS({ json: true });
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return null;
  const allowed = new Set(['title', 'depends_on']);
  if (keys.some((k) => !allowed.has(k))) return null;
  // Shape check, not just key names: r121 keeps `depends_on` participating in
  // dependency-edge parsing, so a scalar/object here is a card we do not
  // understand — leave it for a human rather than normalizing a broken one.
  const title = record['title'];
  if (title !== undefined && typeof title !== 'string') return null;
  const deps = record['depends_on'];
  if (deps !== undefined && deps !== null && !Array.isArray(deps)) return null;
  return `${body}\n`;
}
