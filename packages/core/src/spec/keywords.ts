/**
 * Official Gherkin dialect keyword lookup — the vocabulary SSOT is the
 * official table shipped with @cucumber/gherkin (`dialects`, i.e.
 * gherkin-languages.json, 80 dialects). Emitting keywords from anything
 * else risks mixed-dialect output the official parser rejects.
 *
 * Selection policy (deterministic): the official tables list synonyms in an
 * order that reproduces no contract (en `scenario: ["Example", "Scenario"]`,
 * zh-CN `rule: ["Rule", "规则"]`), so position heuristics cannot work. The
 * en and zh-CN contract keywords (r88 — 不得漂移) are pinned explicitly and
 * MUST be members of their official table (runtime-checked, tests pin the
 * bytes); every other dialect takes the first non-star synonym.
 */
import { dialects, type Dialect } from '@cucumber/gherkin';

export interface GherkinKeywords {
  feature: string;
  rule: string;
  scenario: string;
  given: string;
  when: string;
  thenText: string;
}

/**
 * GherkinKeywords keys ↔ official Dialect field keys (thenText ↔ then).
 */
const TABLE_KEY_PAIRS = [
  ['feature', 'feature'],
  ['rule', 'rule'],
  ['scenario', 'scenario'],
  ['given', 'given'],
  ['when', 'when'],
  ['then', 'thenText'],
] as const;

/** Contract-locked keyword bytes (r88) — membership-checked against the table. */
const LOCKED_KEYWORDS: Record<string, GherkinKeywords> = {
  en: {
    feature: 'Feature',
    rule: 'Rule',
    scenario: 'Scenario',
    given: 'Given',
    when: 'When',
    thenText: 'Then',
  },
  'zh-CN': {
    feature: '功能',
    rule: '规则',
    scenario: '场景',
    given: '假如',
    when: '当',
    thenText: '那么',
  },
};

function pickKeyword(entries: readonly string[]): string {
  return entries.map((k) => k.trim()).find((k) => k !== '' && k !== '*') ?? '';
}

function keywordsFromTable(table: Dialect): GherkinKeywords | null {
  const kw: GherkinKeywords = {
    feature: pickKeyword(table.feature),
    rule: pickKeyword(table.rule),
    scenario: pickKeyword(table.scenario),
    given: pickKeyword(table.given),
    when: pickKeyword(table.when),
    thenText: pickKeyword(table.then),
  };
  if (Object.values(kw).some((v) => v === '')) return null;
  return kw;
}

/** Official keywords for a gherkin dialect, or null when the language has no table. */
export function officialKeywords(language: string): GherkinKeywords | null {
  const table = dialects[language];
  if (!table) return null;
  const locked = LOCKED_KEYWORDS[language];
  if (locked === undefined) return keywordsFromTable(table);
  // A locked byte that left the official table would silently drift the
  // dialect — fall through to the table instead of emitting it.
  const fromTable = keywordsFromTable(table);
  if (fromTable === null) return null;
  return TABLE_KEY_PAIRS.every(([tableKey, kwKey]) =>
    table[tableKey].map((k) => k.trim()).includes(locked[kwKey]),
  )
    ? locked
    : fromTable;
}

/** Official keywords, falling back to the en table for table-less languages. */
export function officialKeywordsOrEn(language: string): GherkinKeywords {
  return officialKeywords(language) ?? officialKeywords('en') ?? LOCKED_KEYWORDS['en']!;
}

/**
 * Official step keyword → kind across every dialect (star-filtered,
 * trimmed). And/But/`*` are absent by construction — callers decide their
 * inheritance. en/zh-CN resolve to the same kinds as the former hand-rolled
 * regexes; other official dialects (fr Soit/Quand/Alors, …) now classify
 * correctly instead of falling into a default.
 */
export const STEP_KIND_BY_KEYWORD: ReadonlyMap<string, 'given' | 'when' | 'then'> = (() => {
  const map = new Map<string, 'given' | 'when' | 'then'>();
  for (const table of Object.values(dialects)) {
    for (const kind of ['given', 'when', 'then'] as const) {
      for (const raw of table[kind]) {
        const k = raw.trim();
        if (k !== '' && k !== '*' && !map.has(k)) map.set(k, kind);
      }
    }
  }
  return map;
})();

export function stepKeywordToOfficialKind(keyword: string): 'given' | 'when' | 'then' | null {
  return STEP_KIND_BY_KEYWORD.get(keyword.trim()) ?? null;
}

function escapeRegExp(k: string): string {
  return k.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Top-level block keywords across every official dialect (2-space indent +
 * keyword + `:`) — next-block boundary scanning must recognize a block end
 * in any language, not just the four hardcoded ones.
 */
export const BLOCK_KEYWORD_LINE_RE: RegExp = new RegExp(
  `^  (?:${[
    ...new Set(
      Object.values(dialects)
        .flatMap((table) => [
          ...table.feature,
          ...table.rule,
          ...table.scenario,
          ...table.scenarioOutline,
          ...table.background,
        ])
        .map((k) => k.trim())
        .filter((k) => k !== '' && k !== '*'),
    ),
  ]
    .map(escapeRegExp)
    .join('|')}):`,
  'u',
);
