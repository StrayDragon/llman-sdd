/**
 * Validation engine (validation capability): aggregates Phase-2 parse errors
 * plus the verdict-equivalent gates (r11/r12, ordered to match v1
 * `spec/validation.rs` observable issue order). Pure — filesystem access is
 * injected via SpecIo.
 */
import type { CapabilityDoc } from '../spec/ir.ts';
import { MUST_WORD_RE, specIdOf } from '../spec/ir.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';

export type ValidationLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationItem {
  level: ValidationLevel;
  /** Gate anchor, e.g. `t/rule/ok` or `t/valid_scope` (v1-style `path`). */
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
const acceptanceReqPath = (cap: string, name: string): string => `${cap}/acceptance/${name}/@req`;
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

  // Header gates (r12 / v1 spec_meta). v1 treats a missing `# capability:`
  // header as a parse-level failure: only `file` + registry-scan issues are
  // emitted and all single-track gates are skipped.
  if (doc.header.capability === null) {
    const msg = `spec \`${cap}\`: missing \`# capability:\` header comment (spec-format r133)`;
    push('ERROR', 'file', msg);
    push('ERROR', 'llmanspec/specs', `Failed to scan req_id index: ${msg}`);
    return { fileName: entry.fileName, capability: cap, ok: false, items };
  }
  if (doc.header.purpose === null || doc.header.purpose.trim() === '') {
    push(
      'ERROR',
      `${cap}/purpose`,
      '`# purpose:` header comment must not be empty (spec-format r133)',
    );
  }
  if (doc.header.scope === null) {
    push(
      'ERROR',
      `${cap}/valid_scope`,
      'Spec valid_scope must not be empty (add it inside the .toon document).',
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

  // Parser-level structural errors (mutual exclusion, removed-tag migration,
  // nested rule scenarios). Header gates and the MUST-word gate are owned here
  // (mapped below), so the parser's duplicate findings are skipped.
  const OWNED_BY_THIS_LAYER = ['missing-header:', 'rule:missing-must-word'];
  for (const err of doc.errors) {
    if (OWNED_BY_THIS_LAYER.some((prefix) => err.code.startsWith(prefix))) continue;
    push('ERROR', err.code.startsWith('file') ? 'file' : `${cap}/${err.code}`, err.message);
  }

  // Single-track gates (v1 validate_single_track order).
  const human = doc.scenarios.filter((s) => s.classification === 'human');
  const acceptance = doc.scenarios.filter((s) => s.classification === 'executable');

  if (human.length === 0) {
    push('ERROR', rulesPath(cap), 'spec must define at least one @human constraint scenario');
  }

  for (const scenario of doc.scenarios) {
    const anchor = `${cap}/rule/${scenario.name}`;
    if (scenario.classification === 'human') {
      if (scenario.reqIds.length === 0) {
        push('ERROR', anchor, '@human constraint scenario must carry an @req:<req_id> tag');
      }
      if (!MUST_WORD_RE.test(scenario.statement)) {
        push('ERROR', anchor, 'constraint statement must contain MUST/SHALL (or 必须/不得/禁止)');
      }
    } else if (scenario.classification === 'executable') {
      // (pairing handled below, after all rule req ids are known)
    } else {
      push(
        'WARNING',
        `${cap}/scenario/${scenario.name}`,
        `scenario \`${scenario.name}\` carries neither @human nor @executable; tag it or drop it`,
      );
    }
    for (const reqId of scenario.reqIds) {
      if (duplicatesFor(reqId)) {
        push(
          'ERROR',
          `${cap}/registry/${reqId}`,
          `global duplicate req_id \`${reqId}\` used by multiple capabilities`,
        );
      }
    }
  }

  // Dangling acceptance @req links (v1 order: acceptance/@req then coverage).
  const ruleReqIds = new Set(human.flatMap((s) => s.reqIds));
  for (const sc of acceptance) {
    // r65: orphan acceptance scenario — no @req link at all (v1 r132 WARNING).
    if (sc.reqIds.length === 0) {
      push(
        'WARNING',
        `${cap}/acceptance/${sc.name}`,
        `orphan acceptance scenario \`${sc.name}\` has no @req:<req_id> link`,
      );
    }
    for (const rid of sc.reqIds) {
      if (!ruleReqIds.has(rid)) {
        push(
          'ERROR',
          acceptanceReqPath(cap, sc.name),
          `@req:${rid} on acceptance scenario \`${sc.name}\` has no matching @human constraint`,
        );
      }
    }
  }

  // Rule coverage INFO (r134 pending rules).
  for (const sc of human) {
    for (const rid of sc.reqIds) {
      const covered = acceptance.some((a) => a.reqIds.includes(rid));
      if (!covered) {
        push(
          'INFO',
          coveragePath(cap),
          `rule ${rid} is pending: no @executable acceptance scenario`,
        );
      }
    }
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
 * (`validate <spec>` path) and the full sweep. v1 parity: a structural error
 * anywhere aborts the req_id index scan, so the duplicate gate only fires
 * when every spec parses cleanly.
 */
export function buildDuplicatesFor(entries: readonly SpecEntry[]): (reqId: string) => boolean {
  const registry = buildReqRegistry(entries);
  const duplicateIds = new Set(registry.duplicates.flatMap((d) => d.reqId));
  const structurallyClean = entries.every((e) => e.doc.errors.length === 0);
  return (reqId: string): boolean => structurallyClean && duplicateIds.has(reqId);
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

/** v1 `apply_strict`: WARNING issues escalate to ERROR when --strict. */
export function applyStrict<T extends { level: ValidationLevel }>(items: readonly T[]): T[] {
  return items.map((i) => (i.level === 'WARNING' ? { ...i, level: 'ERROR' as const } : i));
}
