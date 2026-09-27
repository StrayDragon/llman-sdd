/**
 * Specs listing (peripheral-commands capability, r20/r21): morphology counts.
 * Native model — rules = `规则:` blocks; enforced = rules with at least one
 * nested executable scenario; pending = bare rules; acceptance = nested
 * scenarios; orphan acceptance = top-level scenarios outside any rule.
 */
import { renderMachine } from '../render/machine.ts';
import { specIdOf } from '../spec/ir.ts';
import type { CapabilityDoc } from '../spec/ir.ts';
import type { SpecEntry } from '../validation/validate.ts';
import { pad } from './collect.ts';

export interface SpecMorphology {
  ruleCount: number;
  ruleEnforcedCount: number;
  rulePendingCount: number;
  acceptanceCount: number;
  orphanAcceptanceCount: number;
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
 * CLI text render — rules with executable scenarios are enforced; bare rules
 * without any nested scenario are pending; top-level scenarios are orphans. */
export function morphologyOf(doc: CapabilityDoc): SpecMorphology {
  const rules = doc.rules;
  const acceptance = rules.flatMap((r) => r.scenarios);
  return {
    ruleCount: rules.length,
    ruleEnforcedCount: rules.filter((r) => r.scenarios.length > 0).length,
    rulePendingCount: rules.filter((r) => r.scenarios.length === 0).length,
    acceptanceCount: acceptance.length,
    orphanAcceptanceCount: doc.orphans.length,
  };
}

export function collectSpecs(entries: readonly SpecEntry[]): SpecSummary[] {
  return entries.map((e) => {
    const morphology = morphologyOf(e.doc);
    return {
      id: specIdOf(e),
      title: specIdOf(e),
      purpose: e.doc.header.purpose ?? '',
      validScope: (e.doc.header.scope ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== ''),
      requirementCount: morphology.ruleCount,
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
      `  ${pad(s.id, idWidth)}rules ${m.ruleCount}  enforced ${m.ruleEnforcedCount}  pending ${m.rulePendingCount}  acceptance ${m.acceptanceCount}`,
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
