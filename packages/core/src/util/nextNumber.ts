/**
 * Numeric-id allocator primitive (unify-numeric-id-allocation).
 *
 * One primitive, everywhere max+1: every numeric id distribution (req id
 * taking, dedupe remapping, change sequence numbers, template variables)
 * consumes this function; call sites MUST NOT re-implement probing loops.
 * Uniqueness is judged against the same surveyed set the distribution saw.
 *
 * Zero persisted state: the surveyed set is recomputed per invocation
 * (rescan is the truth) — no counters, tombstones, or cache files.
 */
export function nextNumber(used: Iterable<number>): number {
  const max = maxUsedNumber(used);
  return max === null ? 1 : max + 1;
}

/**
 * Survey metadata companion: the maximum already-used number, `null` when the
 * set is empty (or carries no finite numbers). Single-pass fold — never
 * `Math.max(...spread)`, which risks argument-limit pressure on large sets.
 */
export function maxUsedNumber(used: Iterable<number>): number | null {
  let max: number | null = null;
  for (const n of used) {
    // Non-finite noise (NaN/±Infinity) never wins the fold; an empty (or
    // fully non-numeric) set has no maximum.
    if (Number.isFinite(n) && (max === null || n > max)) max = n;
  }
  return max;
}
