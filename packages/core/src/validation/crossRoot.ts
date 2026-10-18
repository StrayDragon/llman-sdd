/**
 * Cross-root same-value observation (validation r91 shape / scope-boundaries
 * r114 requirement): the aggregate `validate --all-roots` report carries one
 * `{namespace, value, roots[]}` entry per id shared by two or more instance
 * roots, plus a summary count. Pure — the caller injects the per-root values.
 *
 * Single root is not an observation: fewer than two roots returns `undefined`
 * so the field is never emitted (not even as an empty array) and single-root
 * output stays byte-identical (r91 iron rule).
 */

export type CrossRootNamespace = 'spec' | 'req' | 'change';

/** The subset of r91's declared namespace order: spec → req → change. */
const NAMESPACE_ORDER: readonly CrossRootNamespace[] = ['spec', 'req', 'change'];

const NAMESPACE_RANK: ReadonlyMap<CrossRootNamespace, number> = new Map(
  NAMESPACE_ORDER.map((namespace, index) => [namespace, index]),
);

/** One instance root's id values, labelled as the aggregate reports it. */
export interface RootNamespaceValues {
  /** Root label (repo-relative path; `.` for the discovery start root). */
  root: string;
  /** Capability (spec) ids of this root. */
  specIds: readonly string[];
  /** `@req:<id>` handles of this root. */
  reqIds: readonly string[];
  /** Change ids (active leaf names + archived base ids, r87 enumeration). */
  changeIds: readonly string[];
}

export interface CrossRootCollision {
  namespace: CrossRootNamespace;
  value: string;
  /** Roots carrying `value`, by root-relative-path order. */
  roots: string[];
}

/** Code-unit comparison: deterministic regardless of host locale/ICU. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * `{namespace, value, roots[]}` for every id present in ≥ 2 roots, sorted by
 * namespace (r91 declaration order) then value, roots by relative-path order.
 * Returns `undefined` for fewer than two roots (single-root omission, r91).
 */
export function computeCrossRootCollisions(
  facts: readonly RootNamespaceValues[],
): CrossRootCollision[] | undefined {
  if (facts.length < 2) return undefined;
  const buckets = new Map<
    string,
    { namespace: CrossRootNamespace; value: string; roots: Set<string> }
  >();
  for (const fact of facts) {
    const perNamespace: readonly (readonly [CrossRootNamespace, readonly string[]])[] = [
      ['spec', fact.specIds],
      ['req', fact.reqIds],
      ['change', fact.changeIds],
    ];
    for (const [namespace, values] of perNamespace) {
      for (const value of new Set(values)) {
        if (value === '') continue;
        const key = `${namespace}\u0000${value}`;
        const bucket = buckets.get(key) ?? { namespace, value, roots: new Set<string>() };
        bucket.roots.add(fact.root);
        buckets.set(key, bucket);
      }
    }
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.roots.size > 1)
    .map((bucket) => ({
      namespace: bucket.namespace,
      value: bucket.value,
      roots: [...bucket.roots].toSorted(compareStrings),
    }))
    .toSorted(
      (a, b) =>
        (NAMESPACE_RANK.get(a.namespace) ?? 0) - (NAMESPACE_RANK.get(b.namespace) ?? 0) ||
        compareStrings(a.value, b.value),
    );
}
