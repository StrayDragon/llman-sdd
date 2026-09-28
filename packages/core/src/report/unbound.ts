/**
 * `spec unbound` retrieval (peripheral-commands capability, r89): the
 * implementation-readiness feed of unbound requirements. "Unbound" follows the
 * single global definition — a requirement without any runnable nested scenario
 * (@skip/@experimental-only or stepless included) — same口径 as review's
 * `unbound` signal, validate's aggregate INFO and list/show morphology (r90).
 *
 * Ordering is deterministic: capability files in discovery (sorted) order,
 * then rules in document order — agents can consume the feed incrementally.
 * Pure — no filesystem access.
 */
import { ruleHasRunnableScenario, specIdOf } from '../spec/ir.ts';
import type { SpecEntry } from '../validation/validate.ts';

export interface UnboundRequirement {
  /** The `@req:<id>` handle (requirement id). */
  reqId: string;
  /** The `规则:` block title. */
  title: string;
  /** Free-form requirement statement (block description, as authored). */
  statement: string;
  /** Capability (spec) id owning the requirement. */
  capability: string;
  /** Repo-root-relative path of the capability's main .feature file. */
  featurePath: string;
}

/** All unbound requirements across the given specs, in deterministic order. */
export function collectUnboundRequirements(entries: readonly SpecEntry[]): UnboundRequirement[] {
  const out: UnboundRequirement[] = [];
  for (const entry of entries) {
    const capability = specIdOf(entry);
    for (const rule of entry.doc.rules) {
      if (ruleHasRunnableScenario(rule)) continue;
      out.push({
        reqId: rule.reqId,
        title: rule.title,
        statement: rule.description,
        capability,
        featurePath: entry.fileName,
      });
    }
  }
  return out;
}

export interface UnboundFeed {
  /** Total unbound requirements before any limit. */
  total: number;
  /** Entries actually returned (limit applied). */
  returned: number;
  /** `total - returned`; 0 means everything was returned. */
  remaining: number;
  /** Self-introspection hint when remaining > 0 (empty otherwise). */
  hint: string;
  requirements: UnboundRequirement[];
}

/**
 * Build the `spec unbound` feed under a hard limit. `limit` semantics are
 * uniform across every output mode: default 1, `--limit 0` returns all.
 */
export function buildUnboundFeed(entries: readonly SpecEntry[], limit: number): UnboundFeed {
  const all = collectUnboundRequirements(entries);
  const shown = limit === 0 ? all : all.slice(0, limit);
  const returned = shown.length;
  const remaining = all.length - returned;
  const hint = remaining > 0 ? `… 还有 ${remaining} 条未绑定需求,用 --limit 0 列出全部` : '';
  return { total: all.length, returned, remaining, hint, requirements: shown };
}
