/**
 * T25 single dated-archive-id grammar (`YYYY-MM-DD-<id>`): the prefix test and
 * the id split are one regex family — freeze candidates, frozen cards and the
 * graph's archived nodes must agree on what counts as a dated archive entry.
 */
export const DATED_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/u;

/** `2026-01-01-old` → `old`; null when the name is not a dated entry. */
export function datedIdOf(name: string): string | null {
  const m = name.match(new RegExp(`^${DATED_PREFIX_RE.source}(.+)$`, 'u'));
  return m?.[1] ?? null;
}

/** Card form: dated id with the mandatory `.yaml` suffix (files, not dirs). */
export function datedCardIdOf(name: string, suffix: string): string | null {
  if (!name.endsWith(suffix)) return null;
  return datedIdOf(name.slice(0, -suffix.length));
}
