import type { GitLike } from '../git/spawnGit.ts';
import { evaluateStaleness, notApplicableStaleness } from '../validation/staleness.ts';
/**
 * Review aggregation (review-freeze capability, r23): five-signal review over
 * spec IR + validate sweep. Port of v1 sdd/review.rs observable contract.
 */
import { validateAllSpecs, type SpecEntry, type SpecIo } from '../validation/validate.ts';

export type ReviewKind = 'pending' | 'unbound' | 'stale' | 'locked' | 'validate';

export interface ReviewSignal {
  kind: ReviewKind;
  capability: string;
  count: number;
  detail: string;
}

export interface TagBinding {
  kind: 'tags';
  tags: string[];
}

export interface ReviewInput {
  entries: readonly SpecEntry[];
  /** config bdd.bindings (tags sources); null/empty = every acceptance unbound. */
  bindings: readonly TagBinding[] | null;
  /** Active changes currently carrying a branch binding. */
  boundChangeCount: number;
  /** Active change summaries for the strict sweep (pending tasks → FAIL). */
  activeChanges?: readonly { name: string; completedTasks: number; totalTasks: number }[];
  /** Restrict per-capability signals (pending/unbound/stale) to this capability. */
  capability?: string;
  /** git + root for real staleness evaluation (v1 parity). */
  git?: GitLike;
  root?: string;
  specsDir?: string;
}

export interface ReviewResult {
  signals: ReviewSignal[];
  summary: { criticalCount: number; warningCount: number };
  lines: string[];
  exitCode: number;
}

export function buildReview(input: ReviewInput, io: SpecIo): ReviewResult {
  const { entries, boundChangeCount } = input;
  const strictChangeFails = (input.activeChanges ?? []).filter(
    (c) => c.totalTasks > 0 && c.completedTasks < c.totalTasks,
  );
  const signals: ReviewSignal[] = [];
  const push = (kind: ReviewKind, capability: string, count: number, detail = ''): void => {
    signals.push({ kind, capability, count, detail });
  };

  const sweep = validateAllSpecs(entries, io);
  const sorted = [...entries].toSorted((a, b) => a.fileName.localeCompare(b.fileName));

  for (const entry of sorted) {
    const cap = entry.doc.header.capability ?? entry.fileName;
    // r33: per-capability signals honor the --capability filter; locked and
    // validate stay global regardless.
    if (input.capability !== undefined && cap !== input.capability) continue;
    const rules = entry.doc.scenarios.filter((s) => s.classification === 'human');
    const acceptance = entry.doc.scenarios.filter((s) => s.classification === 'executable');
    const acceptanceReqIds = new Set(acceptance.flatMap((s) => s.reqIds));
    const pending = rules.filter((r) => !r.reqIds.some((id) => acceptanceReqIds.has(id)));
    // v1 r5: unbound = orphan acceptance scenarios (no @req link).
    const unbound = acceptance.filter((s) => s.reqIds.length === 0);

    push('pending', cap, pending.length);
    push('unbound', cap, unbound.length);

    // staleness (v1 evaluate): real base-ref/scope evaluation.
    let staleInfo = notApplicableStaleness();
    let staleCount = 0;
    if (input.git !== undefined && input.root !== undefined) {
      const specRel =
        (entry.fileName.startsWith('llmanspec/') ? '' : 'llmanspec/specs/') + entry.fileName;
      const evalResult = evaluateStaleness({
        git: input.git,
        root: input.root,
        specRel,
        scope: entry.doc.header.scope?.split(',').map((x) => x.trim()) ?? [],
        baseRefEnv: process.env.LLMANSPEC_BASE_REF,
      });
      staleInfo = evalResult.info;
      staleCount = staleInfo.status === 'OK' || staleInfo.status === 'NOTAPPLICABLE' ? 0 : 1;
    }
    push('stale', cap, staleCount, staleInfo.status === 'NOTAPPLICABLE' ? '' : staleInfo.status);
  }

  const failed = sweep.verdicts.filter((v) => !v.ok);
  // v1 sweep = `validate --all --strict --no-check`: pending tasks escalate a
  // change to FAIL, and that feeds the review critical count.
  for (const c of strictChangeFails) {
    failed.push({
      fileName: c.name,
      capability: c.name,
      ok: false,
      items: [
        {
          level: 'ERROR',
          id: `${c.name}/tasks`,
          message: `${c.totalTasks - c.completedTasks} unchecked tasks`,
        },
      ],
    });
  }
  // v1 parity: `count` is the removed locked-rule-confirmation concept (always
  // 0 now); the detail text carries the bound-change count separately.
  push(
    'locked',
    '-',
    0,
    `${boundChangeCount} bound change(s); inspect with \`llman sdd change diff <id>\``,
  );
  push(
    'validate',
    '-',
    failed.length,
    failed.length > 0 ? 'validate --all failed; run `llman sdd validate --all` for details' : 'ok',
  );

  const warningCount = signals
    .filter((s) => s.kind !== 'validate' && s.kind !== 'locked')
    .reduce((acc, s) => acc + s.count, 0);
  const criticalCount = failed.length;

  const lines: string[] = [`Review: critical=${criticalCount} warning=${warningCount}`];
  for (const cap of sorted.map((e) => e.doc.header.capability ?? e.fileName)) {
    for (const kind of ['pending', 'unbound', 'stale'] as const) {
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

/** `review --export-html`: fill the v1 shared/review.html template (pure —
 * callers read the template; CLI passes it via core's TEMPLATES_ROOT). */
export function renderReviewHtml(
  template: string,
  result: {
    signals: readonly { kind: string; capability: string; count: number; detail: string }[];
    summary: { criticalCount: number; warningCount: number };
  },
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
    .replaceAll('__GENERATED__', new Date().toISOString());
}
