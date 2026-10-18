/**
 * Review aggregation (review-freeze capability, r23): five-signal review over
 * spec IR + validate sweep. Port of predecessor sdd/review.rs observable contract.
 */
import { collectUnboundRequirements } from '../report/unbound.ts';
import { specIdOf } from '../spec/ir.ts';
import { validateAllSpecs, type SpecEntry } from '../validation/validate.ts';

export type ReviewKind = 'unbound' | 'locked' | 'validate';

export interface ReviewSignal {
  kind: ReviewKind;
  capability: string;
  count: number;
  detail: string;
}

export interface ReviewInput {
  entries: readonly SpecEntry[];
  /** Active changes currently carrying a branch binding. */
  boundChangeCount: number;
  /** Active change summaries for the strict sweep (pending tasks → FAIL). */
  activeChanges?: readonly { name: string; completedTasks: number; totalTasks: number }[];
  /** Restrict per-capability signals (unbound) to this capability. */
  capability?: string;
}

export interface ReviewResult {
  signals: ReviewSignal[];
  summary: { criticalCount: number; warningCount: number };
  lines: string[];
  exitCode: number;
}

export function buildReview(input: ReviewInput): ReviewResult {
  const { entries, boundChangeCount } = input;
  const strictChangeFails = (input.activeChanges ?? []).filter(
    (c) => c.totalTasks > 0 && c.completedTasks < c.totalTasks,
  );
  const signals: ReviewSignal[] = [];
  const push = (kind: ReviewKind, capability: string, count: number, detail = ''): void => {
    signals.push({ kind, capability, count, detail });
  };

  const sweep = validateAllSpecs(entries);
  const sorted = [...entries].toSorted((a, b) => a.fileName.localeCompare(b.fileName));

  // T29: unbound counting is the shared collector (report/unbound) keyed by
  // capability — one definition of "rule without runnable scenario".
  const unboundByCap = new Map<string, number>();
  for (const u of collectUnboundRequirements(entries)) {
    unboundByCap.set(u.capability, (unboundByCap.get(u.capability) ?? 0) + 1);
  }
  for (const entry of sorted) {
    const cap = specIdOf(entry);
    // r33: per-capability signals honor the --capability filter; locked and
    // validate stay global regardless.
    if (input.capability !== undefined && cap !== input.capability) continue;
    push('unbound', cap, unboundByCap.get(cap) ?? 0);
  }

  const failed = sweep.verdicts.filter((v) => !v.ok);
  const sweepFailedCount = failed.length;
  // T35: unchecked tasks are work-in-progress noise, not contract breakage —
  // they degrade to a warningCount contribution instead of the critical count
  // (locked/unbound signals stay untouched).
  const taskWarnings = strictChangeFails.length;
  // predecessor parity: `count` is the removed locked-rule-confirmation concept (always
  // 0 now); the detail text carries the bound-change count separately.
  push(
    'locked',
    '-',
    0,
    `${boundChangeCount} bound change(s); inspect with \`llman-sdd change diff <id>\``,
  );
  // detail names the failing source: sweep failures point at `validate --all`;
  // strict-only failures name the offending changes instead of a command that
  // would report green.
  const sweepDetail =
    sweepFailedCount > 0 ? 'validate --all failed; run `llman-sdd validate --all` for details' : '';
  const strictDetail =
    strictChangeFails.length > 0
      ? `${strictChangeFails.length} active change(s) with unchecked tasks: ${strictChangeFails
          .map((c) => `${c.name} (${c.totalTasks - c.completedTasks} unchecked)`)
          .join(', ')}`
      : '';
  push(
    'validate',
    '-',
    failed.length,
    [sweepDetail, strictDetail].filter(Boolean).join('; ') || 'ok',
  );

  const warningCount =
    signals.filter((s) => s.kind === 'unbound').reduce((acc, s) => acc + s.count, 0) + taskWarnings;
  const criticalCount = failed.length;

  const lines: string[] = [`Review: critical=${criticalCount} warning=${warningCount}`];
  for (const cap of sorted.map((e) => specIdOf(e))) {
    for (const kind of ['unbound'] as const) {
      const s = signals.find((x) => x.kind === kind && x.capability === cap);
      if (!s) continue;
      lines.push(`${kind}: ${cap} (${s.count})`);
      if (s.detail !== '') lines.push(`  - ${s.detail}`);
    }
  }
  for (const kind of ['locked', 'validate'] as const) {
    const s = signals.find((x) => x.kind === kind);
    if (!s) continue;
    lines.push(`${kind}: ${s.capability} (${s.count})`);
    if (s.detail !== '') lines.push(`  - ${s.detail}`);
  }

  return {
    signals,
    summary: { criticalCount, warningCount },
    lines,
    exitCode: criticalCount > 0 ? 1 : 0,
  };
}

/** `review --export-html`: fill the predecessor shared/review.html template (pure —
 * callers read the template; CLI passes it via core's TEMPLATES_ROOT). */
export function renderReviewHtml(
  template: string,
  result: {
    signals: readonly { kind: string; capability: string; count: number; detail: string }[];
    summary: { criticalCount: number; warningCount: number };
  },
  now: Date,
): string {
  const esc = (input: string): string =>
    input
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  let mermaid = 'graph TD\n';
  const sigJson: unknown[] = [];
  result.signals.forEach((s, idx) => {
    const label = esc(
      `${s.capability} [${s.kind}] = ${s.count} — ${s.detail === '' ? 'ok' : s.detail}`,
    );
    mermaid += `    s${idx}["${label}"]\n`;
    sigJson.push({ kind: s.kind, capability: s.capability, count: s.count, detail: s.detail });
  });
  return template
    .replaceAll('__CRITICAL__', String(result.summary.criticalCount))
    .replaceAll('__WARNING__', String(result.summary.warningCount))
    .replaceAll('__SIGNALS__', JSON.stringify(sigJson))
    .replaceAll('__MERMAID__', mermaid)
    .replaceAll('__GENERATED__', now.toISOString());
}
