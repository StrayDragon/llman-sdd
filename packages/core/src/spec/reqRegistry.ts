/**
 * Global rN registry (spec-parsing capability): @req:rN ids on `规则:` blocks
 * form a single global namespace across all capability specs. A duplicate is
 * any id carried by more than one rule — within one file or across files
 * (r10: 按携带该 id 的规则条数 > 1 判定).
 */
import type { CapabilityDoc } from './ir.ts';

export interface RegistryOccurrence {
  fileName: string;
  /** 0-based index of the rule within its doc (in-file locating). */
  ruleIndex: number;
  title: string;
}

export interface RegistryDuplicate {
  reqId: string;
  /** Unique files referencing the id (sorted, display surface). */
  files: string[];
  /** Every rule occurrence referencing the id, in scan order. */
  occurrences: RegistryOccurrence[];
}

export interface ReqRegistry {
  /** reqId → every rule occurrence referencing it (scan order). */
  byId: Map<string, RegistryOccurrence[]>;
  duplicates: RegistryDuplicate[];
}

export function buildReqRegistry(
  docs: readonly { fileName: string; doc: CapabilityDoc }[],
): ReqRegistry {
  const byId = new Map<string, RegistryOccurrence[]>();
  for (const { fileName, doc } of docs) {
    doc.rules.forEach((rule, ruleIndex) => {
      if (rule.reqId === '') return;
      const occurrences = byId.get(rule.reqId) ?? [];
      occurrences.push({ fileName, ruleIndex, title: rule.title });
      byId.set(rule.reqId, occurrences);
    });
  }
  const duplicates: RegistryDuplicate[] = [];
  for (const [reqId, occurrences] of byId) {
    if (occurrences.length > 1) {
      duplicates.push({
        reqId,
        files: [...new Set(occurrences.map((o) => o.fileName))].toSorted(),
        occurrences,
      });
    }
  }
  duplicates.sort((a, b) => a.reqId.localeCompare(b.reqId));
  return { byId, duplicates };
}
