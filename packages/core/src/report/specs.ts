/**
 * Specs listing (peripheral-commands capability, r20/r21/r90): morphology
 * counts. Native model — rules = `规则:` blocks; bound = rules with at least
 * one runnable nested executable scenario; unbound = rules without any runnable
 * nested scenario (@skip/@experimental-only or stepless scenarios do not bind);
 * acceptance = nested scenarios; featureScenarioCount = top-level examples.
 * Machine field names follow the requirement terminology (r90).
 */
import { renderMachine } from '../render/machine.ts';
import { ruleHasRunnableScenario, specIdOf } from '../spec/ir.ts';
import type { CapabilityDoc } from '../spec/ir.ts';
import type { SpecEntry } from '../validation/validate.ts';
import { pad } from './collect.ts';

export interface SpecMorphology {
  requirementBoundCount: number;
  requirementUnboundCount: number;
  acceptanceCount: number;
  featureScenarioCount: number;
}

export interface SpecSummary {
  id: string;
  title: string;
  purpose: string;
  validScope: string[];
  requirementCount: number;
  health: null;
  staleness: null;
  morphology: SpecMorphology;
}

/** Morphology counts shared by `list --specs`, `show <spec> --json`, and the
 * CLI text render — bound/unbound follow the runnable-scenario definition; top-level
 * examples are counted separately with no rule accounting. */
export function morphologyOf(doc: CapabilityDoc): SpecMorphology {
  const rules = doc.rules;
  const acceptance = rules.flatMap((r) => r.scenarios);
  return {
    requirementBoundCount: rules.filter(ruleHasRunnableScenario).length,
    requirementUnboundCount: rules.filter((r) => !ruleHasRunnableScenario(r)).length,
    acceptanceCount: acceptance.length,
    featureScenarioCount: doc.orphans.length,
  };
}

export function collectSpecs(entries: readonly SpecEntry[]): SpecSummary[] {
  return entries.map((e) => {
    const morphology = morphologyOf(e.doc);
    const total = morphology.requirementBoundCount + morphology.requirementUnboundCount;
    return {
      id: specIdOf(e),
      title: specIdOf(e),
      purpose: e.doc.header.purpose ?? '',
      validScope: (e.doc.header.scope ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
      requirementCount: total,
      health: null,
      staleness: null,
      morphology,
    };
  });
}

export function renderSpecsList(summaries: readonly SpecSummary[]): string[] {
  const lines = ['Available specs:'];
  const idWidth = Math.max(...summaries.map((s) => s.id.length), 0) + 2;
  for (const s of summaries) {
    const m = s.morphology;
    lines.push(
      `  ${pad(s.id, idWidth)}requirements ${s.requirementCount}  bound ${m.requirementBoundCount}  unbound ${m.requirementUnboundCount}  acceptance ${m.acceptanceCount}`,
    );
  }
  return lines;
}

export function renderSpecsJson(
  summaries: readonly SpecSummary[],
  mode: 'json' | 'compact-json' | 'toon' = 'json',
): string {
  return renderMachine(summaries, mode);
}
