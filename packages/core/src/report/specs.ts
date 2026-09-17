/**
 * Specs listing (peripheral-commands capability, r20/r21): morphology counts
 * aligned with v1 — rules = @human scenarios; enforced = rules carrying an
 * @req link that has an executable acceptance scenario; pending = the rest.
 */
import type { CapabilityDoc } from '../spec/ir.ts';
import type { SpecEntry } from '../validation/validate.ts';
import { pad } from './collect.ts';

export interface SpecMorphology {
  ruleCount: number;
  ruleEnforcedCount: number;
  ruleManualCount: number;
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

function morphologyOf(doc: CapabilityDoc): SpecMorphology {
  const rules = doc.scenarios.filter((s) => s.classification === 'human');
  const acceptance = doc.scenarios.filter((s) => s.classification === 'executable');
  const acceptanceReqIds = new Set(acceptance.flatMap((s) => s.reqIds));
  const enforced = rules.filter((r) => r.reqIds.some((id) => acceptanceReqIds.has(id)));
  const orphan = acceptance.filter((s) => s.reqIds.length === 0);
  return {
    ruleCount: rules.length,
    ruleEnforcedCount: enforced.length,
    ruleManualCount: rules.filter((r) => r.manual).length,
    rulePendingCount: rules.length - enforced.length,
    acceptanceCount: acceptance.length,
    orphanAcceptanceCount: orphan.length,
  };
}

export function collectSpecs(entries: readonly SpecEntry[]): SpecSummary[] {
  return entries.map((e) => {
    const morphology = morphologyOf(e.doc);
    return {
      id: e.doc.header.capability ?? e.fileName,
      title: e.doc.header.capability ?? e.fileName,
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
      `  ${pad(s.id, idWidth)}rules ${m.ruleCount}  enforced ${m.ruleEnforcedCount}  manual ${m.ruleManualCount}  pending ${m.rulePendingCount}  acceptance ${m.acceptanceCount}`,
    );
  }
  return lines;
}

export function renderSpecsJson(summaries: readonly SpecSummary[]): string {
  return JSON.stringify(summaries, null, 2);
}
