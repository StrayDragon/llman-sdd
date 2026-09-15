/**
 * Pageindex tree (context-index capability, r26): specs IR serialized as a
 * tree — building is LLM-free. Serialization keys are snake_case, matching
 * v1's tree.json so retrieval IDs stay comparable.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { SpecEntry } from '../validation/validate.ts';

export const TREE_VERSION = 1;

export interface SerializedReqNode {
  req_id: string;
  title: string;
  statement: string;
}

export interface SerializedScenarioNode {
  req_id: string;
  id: string;
  given: string;
  when: string;
  then: string;
}

export interface SerializedDocNode {
  spec_id: string;
  purpose: string;
  reqs: SerializedReqNode[];
  scenarios: SerializedScenarioNode[];
}

export interface SerializedTreeIndex {
  version: number;
  spec_hash: string;
  build_timestamp: string;
  chat_model: string;
  docs: SerializedDocNode[];
}

function joinSteps(
  steps: { kind: string; text: string }[],
  kind: 'given' | 'when' | 'then',
): string {
  return steps
    .filter((s) => s.kind === kind)
    .map((s) => s.text)
    .join('\n');
}

export function buildDocs(entries: readonly SpecEntry[]): SerializedDocNode[] {
  return entries
    .map((entry) => {
      const cap = entry.doc.header.capability ?? entry.fileName;
      const reqs = entry.doc.scenarios
        .filter((s) => s.classification === 'human')
        .map((s) => ({
          req_id: s.reqIds[0] ?? '',
          title: s.name,
          statement: s.statement
            .split('\n')
            .map((l) => l.replace(/^-\s+/u, ''))
            .join('\n'),
        }));
      const scenarios = entry.doc.scenarios
        .filter((s) => s.classification === 'executable')
        .map((s) => ({
          req_id: s.reqIds[0] ?? '',
          id: s.name,
          given: joinSteps(s.steps, 'given'),
          when: joinSteps(s.steps, 'when'),
          // `then` is the tree.json contract key, not a thenable
          // oxlint-disable-next-line unicorn/no-thenable
          then: joinSteps(s.steps, 'then'),
        }));
      return { spec_id: cap, purpose: entry.doc.header.purpose ?? '', reqs, scenarios };
    })
    .toSorted((a, b) => a.spec_id.localeCompare(b.spec_id));
}

export function buildTreeIndex(
  entries: readonly SpecEntry[],
  meta: { specHash: string; buildTimestamp: string; chatModel: string },
): SerializedTreeIndex {
  return {
    version: TREE_VERSION,
    spec_hash: meta.specHash,
    build_timestamp: meta.buildTimestamp,
    chat_model: meta.chatModel,
    docs: buildDocs(entries),
  };
}

export interface HashIo {
  exists(p: string): boolean;
  isDirectory(p: string): boolean;
  listDir(p: string): string[];
  readText(p: string): string;
}

/** sha256 over all .feature files, sorted by path (r26 freshness anchor). */
export function computeSpecHash(specsDir: string, io: HashIo): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    if (!io.exists(dir) || !io.isDirectory(dir)) return;
    for (const name of io.listDir(dir).toSorted()) {
      const full = join(dir, name);
      if (io.isDirectory(full)) walk(full);
      else if (name.endsWith('.feature')) {
        hash.update(full);
        hash.update(io.readText(full));
      }
    }
  };
  walk(specsDir);
  return hash.digest('hex');
}
