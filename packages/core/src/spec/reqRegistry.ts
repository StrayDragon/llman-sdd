/**
 * Global rN registry (spec-parsing capability): @req:rN ids form a single
 * global namespace across all capability specs; duplicates are reported with
 * the conflicting file pairs.
 */
import type { CapabilityDoc } from './ir.ts';

export interface RegistryDuplicate {
  reqId: string;
  files: string[];
}

export interface ReqRegistry {
  /** reqId → files referencing it (sorted). */
  byId: Map<string, string[]>;
  duplicates: RegistryDuplicate[];
}

export function buildReqRegistry(
  docs: readonly { fileName: string; doc: CapabilityDoc }[],
): ReqRegistry {
  const byId = new Map<string, string[]>();
  for (const { fileName, doc } of docs) {
    for (const scenario of doc.scenarios) {
      for (const reqId of scenario.reqIds) {
        const files = byId.get(reqId) ?? [];
        if (!files.includes(fileName)) files.push(fileName);
        byId.set(reqId, files);
      }
    }
  }
  const duplicates: RegistryDuplicate[] = [];
  for (const [reqId, files] of byId) {
    if (files.length > 1) duplicates.push({ reqId, files: files.toSorted() });
  }
  duplicates.sort((a, b) => a.reqId.localeCompare(b.reqId));
  return { byId, duplicates };
}
