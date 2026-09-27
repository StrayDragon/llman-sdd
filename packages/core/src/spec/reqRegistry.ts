/**
 * Global rN registry (spec-parsing capability): @req:rN ids on `规则:` blocks
 * form a single global namespace across all capability specs; duplicates are
 * reported with the conflicting file pairs.
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
    for (const rule of doc.rules) {
      if (rule.reqId === '') continue;
      const files = byId.get(rule.reqId) ?? [];
      if (!files.includes(fileName)) files.push(fileName);
      byId.set(rule.reqId, files);
    }
  }
  const duplicates: RegistryDuplicate[] = [];
  for (const [reqId, files] of byId) {
    if (files.length > 1) duplicates.push({ reqId, files: files.toSorted() });
  }
  duplicates.sort((a, b) => a.reqId.localeCompare(b.reqId));
  return { byId, duplicates };
}
