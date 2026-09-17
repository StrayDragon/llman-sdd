/**
 * Embedded template table for single-file binaries.
 *
 * Bun <= 1.4.x has no working embedding mechanism (`assets` is a silent
 * no-op, `?raw`/`?asset` fail to resolve, `import.meta.glob` is unavailable
 * in compiled output), so templates are injected through the same build-time
 * `define` mechanism as LLMAN_SDD_VERSION: build-binary.ts collects
 * packages/core/templates into a root-relative path→content map and sets
 * process.env.LLMAN_SDD_EMBEDDED_TEMPLATES to that JSON. Bun inlines define
 * values as raw expressions — the JSON is a valid object literal, so in the
 * compiled binary the expression IS the table object itself, while a JSON
 * string reaches these callers through the same expression in other engines
 * or when force-set via env. Both forms are accepted below; every non-compiled
 * run (source, npm package, Node) leaves the define unset and falls back to
 * the real filesystem via TEMPLATES_ROOT.
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

/** Read the build-injected table; undefined when absent or malformed. */
export function embeddedTemplates(): Record<string, string> | undefined {
  return resolveEmbeddedTable(process.env.LLMAN_SDD_EMBEDDED_TEMPLATES);
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
