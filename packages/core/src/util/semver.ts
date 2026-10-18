/**
 * T25 single semver compare: numeric major.minor.patch, non-numeric segments
 * compare 0. `compareSemver` is the ordering primitive; `semverLt` is its
 * boolean view (version-drift note) — one implementation, two signatures.
 */
const dot = (v: string): number => Math.trunc(Number(v)) || 0;

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < 3; i++) {
    const ai = dot(pa[i] ?? '0');
    const bi = dot(pb[i] ?? '0');
    if (ai !== bi) return ai < bi ? -1 : 1;
  }
  return 0;
}

export function semverLt(a: string, b: string): boolean {
  return compareSemver(a, b) < 0;
}
