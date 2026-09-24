/**
 * Embedded template table for single-file binaries.
 *
 * Compiled binaries receive the table through the same build-time define
 * mechanism as the version (see apps/cli/src/cli-shared.ts — the define read
 * lives at the CLI seam, core only receives already-resolved values). Bun
 * inlines define values as raw expressions; both the JSON-string form and a
 * pre-parsed object literal are accepted below. Every non-compiled run
 * (source, npm package, Node) leaves the value unset and falls back to the
 * real filesystem via TEMPLATES_ROOT.
 */
import type { TemplateIo } from './skills.ts';

function isTable(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Normalize a define/raw value into the template table; undefined when bad. */
export function resolveEmbeddedTable(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === '') return undefined;
  if (isTable(value)) return value;
  if (typeof value === 'string') {
    try {
      const table: unknown = JSON.parse(value);
      if (isTable(table)) return table;
    } catch {
      // A malformed define must not silently yield a half-broken binary; treat
      // as absent so the missing file surfaces loudly on first read.
    }
  }
  return undefined;
}

/** Resolve the caller-passed define value; undefined when absent or malformed. */
export function embeddedTemplates(raw?: unknown): Record<string, string> | undefined {
  return resolveEmbeddedTable(raw);
}

/**
 * Embedded keys are relative to the templates root while callers address
 * files by `join(TEMPLATES_ROOT, rel)`, so the key is the segment after the
 * last `/templates/` boundary — correct for both source-mode (repository
 * path) and $bunfs-mode (`/$bunfs/root/...` → `/templates/...`) roots.
 */
export function templateKeyFor(path: string): string {
  const marker = '/templates/';
  const idx = path.lastIndexOf(marker);
  return idx === -1 ? path : path.slice(idx + marker.length);
}

/** TemplateIo over the embedded table (no filesystem access). */
export function makeEmbeddedTemplateIo(table: Record<string, string>): TemplateIo {
  return {
    exists: (p: string): boolean => templateKeyFor(p) in table,
    readText: (p: string): string => {
      const key = templateKeyFor(p);
      const content = table[key];
      if (content === undefined) throw new Error(`embedded template not found: ${key}`);
      return content;
    },
  };
}
