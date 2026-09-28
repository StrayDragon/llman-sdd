/**
 * Spec IR (spec-parsing capability): pure data shapes produced by
 * parseCapability() and consumed by validation (Phase 3) and downstream
 * commands. No IO of any kind lives here.
 *
 * Native model (v2): a capability feature is `功能:` → `规则:` blocks (the
 * requirement: title + free-form description + `@req:<id>` handle on the block
 * header) → nested `场景:` (executable GWT examples). Top-level scenarios that
 * are not under any rule are orphans. Legacy tags (@human/@rule/@executable)
 * are inert to parsing; migrate with `spec migrate-native`.
 */

export interface CapabilityHeader {
  capability: string | null;
  purpose: string | null;
  scope: string | null;
}

export type ScenarioStepKind = 'given' | 'when' | 'then';

export interface ScenarioStep {
  kind: ScenarioStepKind;
  text: string;
}

export interface ScenarioIR {
  name: string;
  /** Non-`@req` tags on this scenario (e.g. `@skip`, `@experimental`). */
  tags: string[];
  /** Whether the runner should execute this scenario (false for @skip etc.). */
  runnable: boolean;
  stepCount: number;
  steps: ScenarioStep[];
  /** Step-texts joined (retrieval/context surface); empty for a stepless scenario. */
  statement: string;
}

export interface RuleIR {
  /** The `@req:<id>` handle on the rule block header (global-registry key). */
  reqId: string;
  /** The `规则:` block title. */
  title: string;
  /** Free-form requirement statement (block description lines, as authored). */
  description: string;
  /** Nested executable examples belonging to this rule. */
  scenarios: ScenarioIR[];
  /** Non-`@req` tags on the rule block header (legacy @human etc. — inert). */
  tags: string[];
}

export interface SpecStructuralError {
  /** Machine-ish anchor, e.g. `missing-header:purpose` or `scenario:样例`. */
  code: string;
  message: string;
}

export interface CapabilityDoc {
  fileName: string;
  header: CapabilityHeader;
  featureName: string;
  language: string;
  /** Requirement blocks (`规则:`); the canonical rule set. */
  rules: RuleIR[];
  /** Top-level scenarios not enclosed by any rule (orphans). */
  orphans: ScenarioIR[];
  errors: SpecStructuralError[];
}

/**
 * Whether a requirement is bound to real logic — it has at least one runnable
 * nested scenario (not `@skip`/`@experimental` and carrying steps). Single
 * authority for the `bound`/`unbound` definition shared by review's `unbound`
 * signal, validate's aggregate INFO, list/show morphology and `spec unbound`.
 */
export function ruleHasRunnableScenario(rule: RuleIR): boolean {
  return rule.scenarios.some((s) => s.runnable && s.stepCount > 0);
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
