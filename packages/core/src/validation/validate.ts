/**
 * Validation engine (validation capability): aggregates Phase-2 parse errors
 * plus the verdict-equivalent gates probed from v1 (r11/r12). Pure —
 * filesystem access is injected via SpecIo.
 */
import type { CapabilityDoc } from '../spec/ir.ts';
import { MUST_WORD_RE } from '../spec/ir.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';

export type ValidationLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationItem {
  level: ValidationLevel;
  /** Gate anchor, e.g. `t/rule/ok` or `t/valid_scope` (v1-style). */
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

export function validateCapability(
  entry: SpecEntry,
  duplicatesFor: (reqId: string) => boolean,
  io: SpecIo,
): SpecVerdict {
  const { doc } = entry;
  const cap = doc.header.capability ?? entry.fileName;
  const items: ValidationItem[] = [];

  // Header gates (r12): capability header is an ERROR (v1 parity); missing
  // purpose/scope degrade to WARNING.
  if (doc.header.capability === null) {
    items.push({
      level: 'ERROR',
      id: 'file',
      message: 'missing `# capability:` header comment',
    });
  }
  if (doc.header.purpose === null) {
    items.push({ level: 'WARNING', id: 'file', message: 'missing `# purpose:` header comment' });
  }
  if (doc.header.scope === null) {
    items.push({ level: 'WARNING', id: 'file', message: 'missing `# scope:` header comment' });
  } else {
    for (const p of doc.header.scope
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')) {
      if (!io.exists(p)) {
        items.push({
          level: 'ERROR',
          id: `${cap}/valid_scope`,
          message: `valid_scope path(s) do not exist on disk: ${p}`,
        });
      }
    }
  }

  // Structural errors from parsing (mutual exclusion, manual orphan, nested
  // rule scenarios) — all ERROR level (v1 verdict parity). Header gates and
  // the MUST-word gate are owned by this layer (mapped below), so the
  // parser's duplicate findings are skipped here.
  const OWNED_BY_THIS_LAYER = ['missing-header:', 'rule:missing-must-word'];
  for (const err of doc.errors) {
    if (OWNED_BY_THIS_LAYER.some((prefix) => err.code.startsWith(prefix))) continue;
    items.push({ level: 'ERROR', id: `${cap}/${err.code}`, message: err.message });
  }

  for (const scenario of doc.scenarios) {
    const anchor = `${cap}/rule/${scenario.name}`;
    if (scenario.classification === 'human') {
      if (scenario.reqIds.length === 0) {
        items.push({
          level: 'ERROR',
          id: anchor,
          message: '@human constraint scenario must carry an @req:<req_id> tag',
        });
      }
      if (!MUST_WORD_RE.test(scenario.statement)) {
        items.push({
          level: 'ERROR',
          id: anchor,
          message: 'constraint statement must contain MUST/SHALL (or 必须/不得/禁止)',
        });
      }
    }
    for (const reqId of scenario.reqIds) {
      if (duplicatesFor(reqId)) {
        items.push({
          level: 'ERROR',
          id: `${cap}/registry/${reqId}`,
          message: `global duplicate req_id \`${reqId}\` used by multiple capabilities`,
        });
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

export function validateAllSpecs(entries: readonly SpecEntry[], io: SpecIo): ValidationReport {
  const registry = buildReqRegistry(entries);
  const duplicateIds = new Set(registry.duplicates.flatMap((d) => d.reqId));
  // v1 parity: a structural error anywhere aborts the req_id index scan, so
  // the duplicate gate only fires when every spec parses cleanly.
  const structurallyClean = entries.every((e) => e.doc.errors.length === 0);
  const duplicatesFor = (reqId: string): boolean => structurallyClean && duplicateIds.has(reqId);

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
  lines.push(
    `Totals: ${passed} passed, ${verdicts.length - passed} failed (${verdicts.length} items)`,
  );

  return { verdicts, lines, failed };
}
