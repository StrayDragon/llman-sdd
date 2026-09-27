/**
 * Legacy → native spec migration (v1 tag-based flat layout → native `规则:`
 * blocks with nested `场景:`). Pure text transform with IO injected by the
 * caller. Used by `spec migrate-native` (interactive + --dry-run) and the
 * in-repo one-shot migration.
 *
 * Parsing ALWAYS goes through the official @cucumber/gherkin parser
 * (parseFeatureSource) — no hand-rolled line scanning; the legacy ROLE is
 * derived from the tag set the official parser exposes per scenario.
 */

import { parseFeatureSource } from './parser.ts';

export interface MigrateBlock {
  reqIds: string[];
  isRule: boolean;
  skip: boolean;
  title: string;
  /** Statement description lines for rules; step [keyword,text] pairs for acceptances. */
  descriptionLines: string[];
  steps: { keyword: string; text: string }[];
}

export interface MigrateAnalysis {
  blocks: MigrateBlock[];
}

export type MigrateResult =
  | { ok: true; content: string; rules: number; scenarios: number }
  | { ok: false; message: string };

const REQ_TAG_RE = /^@?req:(r\d+)$/u;

function tagsOf(tags: readonly { name: string }[]): {
  reqIds: string[];
  isRule: boolean;
  skip: boolean;
} {
  const names = tags.map((t) => t.name);
  const reqIds = names
    .map((n) => n.match(REQ_TAG_RE)?.[1])
    .filter((v): v is string => v !== undefined);
  const isRule = names.some((n) => n === '@rule' || n === '@human');
  const skip = names.some((n) => n === '@skip' || n === '@experimental');
  return { reqIds, isRule, skip };
}

/**
 * True when the source already uses the native layout (has at least one
 * top-level `规则:` block). Uses the official parser.
 */
export function hasNativeRules(source: string): boolean {
  try {
    const { doc } = parseFeatureSource(source);
    return (doc.feature?.children ?? []).some((c) => c.rule !== undefined);
  } catch {
    return false;
  }
}

/**
 * Analyze a legacy source through the official parser: every top-level
 * scenario becomes a block; its role comes from the tags, its body from the
 * official description/step fields.
 */
export function analyzeLegacy(source: string): MigrateAnalysis | { ok: false; message: string } {
  const { doc } = parseFeatureSource(source);
  const blocks: MigrateBlock[] = [];
  for (const child of doc.feature?.children ?? []) {
    if (child.rule) {
      // native source — nothing to migrate here; caller should skip
      continue;
    }
    const sc = child.scenario;
    if (!sc) continue;
    const { reqIds, isRule, skip } = tagsOf(sc.tags);
    blocks.push({
      reqIds,
      isRule,
      skip,
      title: sc.name,
      descriptionLines: (sc.description ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== ''),
      steps: sc.steps.map((s) => ({ keyword: s.keyword.trim(), text: s.text.trim() })),
    });
  }
  return { blocks };
}

/** Strip `- ` list markers from a rule-statement line (legacy prose residue). */
function stripBullet(line: string): string {
  return line.replace(/^-\s+/u, '');
}

/**
 * Migrate one legacy feature source to the native layout. Structural rules:
 * rules keep file order; acceptances nest under the rule carrying their
 * @req id (file order); acceptances without a matching rule stay top-level
 * orphans. Non-scenario lines (headers/feature/comments) are NOT touched —
 * the native output only emits tag/rule/scenario lines, so the preamble is
 * reconstructed by the caller from the original file.
 */
export function migrateNativeSource(source: string): MigrateResult {
  const analysis = analyzeLegacy(source);
  if ('ok' in analysis) return { ok: false, message: analysis.message };

  const { blocks } = analysis as MigrateAnalysis;
  if (blocks.length === 0) {
    return { ok: false, message: 'no legacy scenarios found (already native?)' };
  }

  // preamble: everything before the first top-level tag line (headers,
  // feature line, comments) — cut textually, preserved verbatim.
  const lines = source.split('\n');
  let preEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('  @')) break;
    preEnd = i + 1;
  }
  const preamble = lines.slice(0, preEnd);

  const out: string[] = [...preamble];
  let rules = 0;
  let scenarios = 0;
  const consumed = new Set<number>();

  for (const b of blocks) {
    if (!b.isRule) continue;
    rules++;
    out.push(`  @req:${b.reqIds[0] ?? ''}`);
    out.push(`  规则: ${b.title}`);
    for (const line of b.descriptionLines) {
      const text = stripBullet(line);
      if (text !== '') out.push(`    ${text}`);
    }
    for (const [ai, a] of blocks.entries()) {
      if (a.isRule || consumed.has(ai)) continue;
      if (!a.reqIds.some((rid) => b.reqIds.includes(rid))) continue;
      consumed.add(ai);
      scenarios++;
      out.push('');
      if (a.skip) out.push('    @skip');
      out.push(`    场景: ${a.title}`);
      for (const s of a.steps) out.push(`      ${s.keyword} ${s.text}`);
    }
  }
  // Unbound acceptance scenarios (no matching rule) are emitted last at
  // top level — native feature-level examples with no requirement handle.
  // Under official Gherkin parsing they are absorbed into the preceding rule,
  // which is their natural functional home; no special signal exists for them.
  for (const [ai, a] of blocks.entries()) {
    if (a.isRule || consumed.has(ai)) continue;
    consumed.add(ai);
    scenarios++;
    out.push('');
    if (a.skip) out.push('  @skip');
    out.push(`  场景: ${a.title}`);
    for (const s of a.steps) out.push(`    ${s.keyword} ${s.text}`);
  }

  if (rules === 0) {
    return { ok: false, message: 'no legacy rule scenarios found (@req + @rule/@human)' };
  }
  return { ok: true, content: `${out.join('\n')}\n`, rules, scenarios };
}
