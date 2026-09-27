/**
 * Spec IR (spec-parsing capability): pure data shapes produced by
 * parseCapability() and consumed by validation (Phase 3) and downstream
 * commands. No IO of any kind lives here.
 */

export interface CapabilityHeader {
  capability: string | null;
  purpose: string | null;
  scope: string | null;
}

export type ScenarioClassification = 'human' | 'executable' | 'unclassified';

export interface ScenarioIR {
  name: string;
  /** Tag names without the leading `@`. */
  tags: string[];
  /** `@req:rN` links, normalized to `rN`. */
  reqIds: string[];
  classification: ScenarioClassification;
  /**
   * Requirement/rule role. `@rule` tags mark a scenario as a rule; `@human`
   * implies rule (governance constraints); plain `@executable` scenarios are
   * acceptance (link to a rule via `@req`). Set by the parser; consumers use
   * `isRuleScenario()` — never infer from `classification` alone.
   */
  rule: boolean;
  /** Rule statement (description lines, trimmed) + step texts for executables. */
  statement: string;
  stepCount: number;
  /** Executable-scenario steps with their keyword kinds (context-index tree). */
  steps: { kind: 'given' | 'when' | 'then'; text: string }[];
}

export interface SpecStructuralError {
  /** Machine-ish anchor, e.g. `missing-header:purpose` or `scenario:规则样例`. */
  code: string;
  message: string;
}

export interface CapabilityDoc {
  fileName: string;
  header: CapabilityHeader;
  featureName: string;
  language: string;
  scenarios: ScenarioIR[];
  errors: SpecStructuralError[];
}

/**
 * Sharing helper for every rule-set consumer (validation, review, specs
 * report, context tree): a scenario is a rule when it carries the `@rule` tag
 * or is a `@human` governance constraint. Plain `@executable` scenarios are
 * acceptance and MUST NOT be counted as rules.
 */
export function isRuleScenario(s: ScenarioIR): boolean {
  return s.rule === true;
}

/**
 * Single spec-id caliber (r25) for every consumer that labels a discovered
 * spec entry: the `# capability:` header wins, else the fileName minus the
 * `.feature` suffix. Unifies the former dual caliber (bare `fileName` vs
 * stripped stem) shared by review/context-tree/specs-report/validate paths.
 */
export function specIdOf(entry: { fileName: string; doc: CapabilityDoc }): string {
  return entry.doc.header.capability ?? entry.fileName.replace(/\.feature$/u, '');
}

/**
 * predecessor wording: constraint statements must contain one of these tokens.
 * Shared by the parser (structural error), validation (verdict gate), and
 * add-req (authoring gate) so all three MUST-word checks are the same
 * caliber: ASCII keywords match on word boundaries (MUSTARD must NOT hit),
 * CJK keywords match literally.
 */
export const MUST_WORD_TERMS = ['MUST', 'SHALL', '必须', '不得', '禁止'] as const;

const escapeRe = (term: string): string => term.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const MUST_WORD_RE = new RegExp(
  MUST_WORD_TERMS.map((term) =>
    /^[A-Za-z]+$/u.test(term) ? `\\b${escapeRe(term)}\\b` : escapeRe(term),
  ).join('|'),
  'u',
);
