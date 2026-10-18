/**
 * Global spec-id assignment (spec-parsing r101): after discovering all
 * `.feature` files under one `llmanspec/specs/` instance, each entry gets a
 * unique `specId` from path preference + collision disambiguation.
 */
/** Minimal entry shape for id assignment (avoids validation↔spec cycle). */
export interface SpecIdAssignable {
  fileName: string;
  specId?: string;
}

/** `rel` path relative to specs root (POSIX slashes, includes `.feature`). */
export function featureRelPath(fileName: string, specsDir: string): string {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/$/u, '');
  const root = norm(specsDir);
  let rel = norm(fileName);
  const prefix = `${root}/`;
  if (rel.startsWith(prefix)) return rel.slice(prefix.length);
  // Path-form independence (fix-review-sweep-path): callers may load entries
  // with absolute file names while specsDir stays root-relative (the review
  // sweep did exactly that). Locate the LAST whole-segment occurrence of the
  // specs root inside the file name and keep the tail — the id must depend on
  // the position inside the specs tree, never on the caller's path shape.
  const needle = `/${root}/`;
  const at = rel.lastIndexOf(needle);
  if (at >= 0) return rel.slice(at + needle.length);
  return rel;
}

/** Preference id before instance-wide collision resolution (r101). */
export function preferredSpecIdFromRel(rel: string): string {
  const withoutExt = rel.replace(/\.feature$/u, '');
  const parts = withoutExt.split('/');
  const stem = parts.at(-1) ?? '';
  if (parts.length === 1) return stem;
  if (parts.length === 2 && parts[0] === stem) return stem;
  return withoutExt;
}

function finalSpecIdFromRel(rel: string, preferredCount: number): string {
  const preferred = preferredSpecIdFromRel(rel);
  if (preferredCount === 1) return preferred;
  return rel.replace(/\.feature$/u, '');
}

/**
 * Mutates `entries[].specId`. Returns spec ids that appear on more than one
 * file after assignment (layout error).
 */
export function assignSpecIds(entries: SpecIdAssignable[], specsDir: string): Set<string> {
  const rels = entries.map((entry) => ({
    entry,
    rel: featureRelPath(entry.fileName, specsDir),
  }));

  const preferredCounts = new Map<string, number>();
  for (const { rel } of rels) {
    const preferred = preferredSpecIdFromRel(rel);
    preferredCounts.set(preferred, (preferredCounts.get(preferred) ?? 0) + 1);
  }

  for (const { entry, rel } of rels) {
    const preferred = preferredSpecIdFromRel(rel);
    const count = preferredCounts.get(preferred) ?? 0;
    entry.specId = finalSpecIdFromRel(rel, count);
  }

  const byId = new Map<string, number>();
  for (const { entry } of rels) {
    const id = entry.specId ?? '';
    byId.set(id, (byId.get(id) ?? 0) + 1);
  }
  return new Set([...byId.entries()].filter(([, n]) => n > 1).map(([id]) => id));
}
