/**
 * Validation engine (validation capability): aggregates Phase-2 parse errors
 * plus the verdict-equivalent gates (r11/r12, ordered to match predecessor
 * `spec/validation.rs` observable issue order). Pure — filesystem access is
 * injected via SpecIo.
 */
import type { CapabilityDoc } from '../spec/ir.ts';
import { specIdOf } from '../spec/ir.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';

export type ValidationLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationItem {
  level: ValidationLevel;
  /** Gate anchor, e.g. `t/rule/ok` or `t/valid_scope` (predecessor-style `path`). */
  id: string;
  message: string;
}

export interface SpecEntry {
  fileName: string;
  doc: CapabilityDoc;
}

export interface SpecIo {
  exists(path: string): boolean;
}

export interface SpecVerdict {
  fileName: string;
  capability: string;
  ok: boolean;
  items: ValidationItem[];
}

export interface ValidationReport {
  verdicts: SpecVerdict[];
  /** Report lines: `OK|FAIL spec/<cap>` entries, `[LEVEL]` details, Totals. */
  lines: string[];
  failed: boolean;
}

const rulesPath = (cap: string): string => `${cap}/rules`;
const coveragePath = (cap: string): string => `${cap}/coverage`;

export function validateCapability(
  entry: SpecEntry,
  duplicatesFor: (reqId: string) => boolean,
  io: SpecIo,
  opts: { strict?: boolean } = {},
): SpecVerdict {
  const { doc } = entry;
  const cap = specIdOf(entry);
  const strict = opts.strict === true;
  const items: ValidationItem[] = [];

  const push = (level: ValidationLevel, id: string, message: string): void => {
    items.push({ level, id, message });
  };

  // Header gates (r12 / predecessor spec_meta). predecessor treats a missing `# capability:`
  // header as a parse-level failure: only `file` + registry-scan issues are
  // emitted and all single-track gates are skipped.
  if (doc.header.capability === null) {
    const msg = `spec \`${cap}\`: missing \`# capability:\` header comment`;
    push('ERROR', 'file', msg);
    push('ERROR', 'llmanspec/specs', `Failed to scan req_id index: ${msg}`);
    return { fileName: entry.fileName, capability: cap, ok: false, items };
  }
  if (doc.header.purpose === null || doc.header.purpose.trim() === '') {
    push('ERROR', `${cap}/purpose`, '`# purpose:` header comment must not be empty');
  }
  if (doc.header.scope === null) {
    push(
      'ERROR',
      `${cap}/valid_scope`,
      'Spec valid_scope must not be empty (declare it in the "# scope:" header comment).',
    );
  } else {
    // r42: missing valid_scope paths are independent failures —
    // ERROR (nonzero exit) under --strict, WARNING otherwise.
    const missing = doc.header.scope
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .filter((s) => !io.exists(s));
    if (missing.length > 0) {
      push(
        strict ? 'ERROR' : 'WARNING',
        `${cap}/valid_scope`,
        `valid_scope path(s) do not exist on disk: ${missing.join(', ')}`,
      );
    }
  }

  // Spec name must match the capability id (flat stem).
  if (doc.header.capability !== null && doc.header.capability.trim() !== cap) {
    push(
      'WARNING',
      `${cap}/meta.name`,
      `Spec \`# capability:\` header must match spec id (flat file stem or directory name): \`${doc.header.capability.trim()}\` != \`${cap}\``,
    );
  }

  // Feature title must be non-empty.
  if ((doc.featureName ?? '').trim() === '') {
    push('ERROR', `${cap}/feature`, 'Feature line must carry a title');
  }

  // Parser-level structural errors. Header gates are owned here (mapped below);
  // the parser's duplicate header findings are skipped.
  const OWNED_BY_THIS_LAYER = ['missing-header:'];
  for (const err of doc.errors) {
    if (OWNED_BY_THIS_LAYER.some((prefix) => err.code.startsWith(prefix))) continue;
    push('ERROR', err.code.startsWith('file') ? 'file' : `${cap}/${err.code}`, err.message);
  }

  // Native single-track gates: `规则:` blocks with `@req` handles; nested
  // `场景:` are their executable examples; top-level scenarios are orphans.
  const rules = doc.rules;

  if (rules.length === 0) {
    push('ERROR', rulesPath(cap), 'spec must define at least one rule');
  }

  for (const rule of rules) {
    const anchor = `${cap}/rule/${rule.title}`;
    if (rule.reqId === '') {
      push('ERROR', anchor, 'rule must carry an @req:<req_id> tag on the rule header');
    } else if (duplicatesFor(rule.reqId)) {
      push(
        'ERROR',
        `${cap}/registry/${rule.reqId}`,
        `global duplicate req_id \`${rule.reqId}\` used by multiple capabilities`,
      );
    }
  }

  // r65 (migrated): a top-level scenario not enclosed by any rule is an
  // orphan acceptance — WARNING.
  for (const sc of doc.orphans) {
    push(
      'WARNING',
      `${cap}/acceptance/${sc.name}`,
      `orphan scenario \`${sc.name}\` is not enclosed by any rule`,
    );
  }

  // Bare-rule aggregate (r134 migrated): rules with no nested executable
  // scenario, aggregated per capability (never one issue per rule), INFO so it
  // never blocks anything. The real accountability lives in the review
  // `pending` signal and the specs-compact workflow.
  const bare = rules.filter((r) => r.scenarios.length === 0).length;
  if (bare > 0) {
    push(
      'INFO',
      coveragePath(cap),
      `${bare} bare rule(s) without any executable scenario — convert to 场景: or compact`,
    );
  }

  return {
    fileName: entry.fileName,
    capability: cap,
    ok: !items.some((i) => i.level === 'ERROR'),
    items,
  };
}

/**
 * Shared req_id duplicate gate — single source of truth for the CLI
 * (`validate <spec>` path) and the full sweep. The registry is built from the
 * already-parsed docs, so a duplicate is reported for every involved
 * capability regardless of unrelated parse errors elsewhere (r12 acceptance:
 * 重复 req_id MUST 对每个涉事 capability 判 ERROR — the 前代 "structural error
 * aborts the index scan" guard is intentionally dropped; a parse-failed spec
 * merely omits the scenarios it could not decode, never invents ids).
 */
export function buildDuplicatesFor(entries: readonly SpecEntry[]): (reqId: string) => boolean {
  const registry = buildReqRegistry(entries);
  const duplicateIds = new Set(registry.duplicates.flatMap((d) => d.reqId));
  return (reqId: string): boolean => duplicateIds.has(reqId);
}

/** `Totals:` report line — single wording source for the engine and the CLI. */
export function formatTotals(passed: number, failed: number, total: number): string {
  return `Totals: ${passed} passed, ${failed} failed (${total} items)`;
}

export function validateAllSpecs(entries: readonly SpecEntry[], io: SpecIo): ValidationReport {
  const duplicatesFor = buildDuplicatesFor(entries);

  const verdicts = entries.map((e) => validateCapability(e, duplicatesFor, io));
  const failed = verdicts.some((v) => !v.ok);
  const passed = verdicts.filter((v) => v.ok).length;

  const lines: string[] = [];
  for (const v of verdicts) {
    lines.push(`${v.ok ? 'OK' : 'FAIL'} spec/${v.capability}`);
    for (const item of v.items) {
      lines.push(`  [${item.level}] ${item.id}: ${item.message}`);
    }
  }
  lines.push(formatTotals(passed, verdicts.length - passed, verdicts.length));

  return { verdicts, lines, failed };
}

/** predecessor `apply_strict`: WARNING issues escalate to ERROR when --strict. */
export function applyStrict<T extends { level: ValidationLevel }>(items: readonly T[]): T[] {
  return items.map((i) => (i.level === 'WARNING' ? { ...i, level: 'ERROR' as const } : i));
}
