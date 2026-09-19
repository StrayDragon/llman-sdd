/**
 * Change-id prefix resolution (peripheral-commands r61, v1 cli spec r112):
 * exact match > unique prefix > multiple candidates > no match, all
 * case-sensitive. Candidates are the active change ids discovered via
 * collectChanges (depth-limited, archive-skipping). Pure — IO is injected.
 */
import { collectChanges, type ChangeFsIo } from '../report/collect.ts';

export interface ResolvedChangeId {
  id: string;
  viaPrefix: boolean;
}

export class ChangeIdResolveError extends Error {}

export function resolveChangeId(
  io: ChangeFsIo,
  root: string,
  input: string,
  opts: { maxScanDepth?: number } = {},
): ResolvedChangeId {
  const ids = collectChanges(io, root, new Date(0), opts).map((c) => c.name);
  if (ids.includes(input)) return { id: input, viaPrefix: false };
  const matches = ids.filter((id) => id.startsWith(input));
  if (matches.length === 1) return { id: matches[0] as string, viaPrefix: true };
  if (matches.length > 1) {
    throw new ChangeIdResolveError(
      `change '${input}' matches multiple active changes:\n${matches
        .map((m) => `  - ${m}`)
        .join('\n')}\nDid you mean one of these?`,
    );
  }
  throw new ChangeIdResolveError(`change not found: ${input}`);
}
