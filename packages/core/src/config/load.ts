/**
 * Config loading (config-schema capability): parse YAML text + validate
 * against the zod contract. Pure — no filesystem access; callers read the
 * file and hand over the string.
 *
 * Validation failures report at most 5 issue lines (r6), each prefixed with
 * its field path.
 */
import { parse } from 'yaml';

import { compileChangeIdPattern } from './changeId.ts';
import { sddConfigSchema, type SddConfig } from './schema.ts';

export const MAX_REPORTED_ISSUES = 5;

export class ConfigValidationError extends Error {
  /** All issue lines (untruncated) for programmatic consumers. */
  readonly issues: string[];

  constructor(issues: string[]) {
    const shown = issues.slice(0, MAX_REPORTED_ISSUES);
    super(
      `invalid llmanspec/config.yaml (${issues.length} issue${issues.length === 1 ? '' : 's'}, showing up to ${MAX_REPORTED_ISSUES}):\n` +
        shown.map((i) => `- ${i}`).join('\n'),
    );
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/**
 * Legacy `bdd:` section elevation (specs-check-config-and-unbound-feed):
 * a present `bdd` block is recognised at load time and elevated onto the new
 * `specs` semantics (`run_command` → `check_command`, `framework`/`verify_prompt`
 * carried under the same names). The new-form `specs` block wins on key conflicts;
 * the legacy block only fills gaps. Any undeclared legacy subkeys (bindings,
 * default_language, feature_dir …) are dropped. Pure — never mutates the input;
 * the caller decides how to surface the migration warning.
 */
export function elevateLegacyBdd(data: unknown): { data: unknown; legacyBddElevated: boolean } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { data, legacyBddElevated: false };
  }
  const rec: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  const bdd = rec['bdd'];
  if (bdd === undefined || bdd === null || typeof bdd !== 'object' || Array.isArray(bdd)) {
    return { data, legacyBddElevated: false };
  }
  const legacy = bdd as Record<string, unknown>;
  const specs =
    typeof rec['specs'] === 'object' && rec['specs'] !== null && !Array.isArray(rec['specs'])
      ? (rec['specs'] as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...specs };
  if (merged['check_command'] === undefined && typeof legacy['run_command'] === 'string') {
    merged['check_command'] = legacy['run_command'];
  }
  if (merged['framework'] === undefined && typeof legacy['framework'] === 'string') {
    merged['framework'] = legacy['framework'];
  }
  if (merged['verify_prompt'] === undefined && typeof legacy['verify_prompt'] === 'string') {
    merged['verify_prompt'] = legacy['verify_prompt'];
  }
  delete rec['bdd'];
  rec['specs'] = merged;
  return { data: rec, legacyBddElevated: true };
}

/**
 * Load + validate, returning the parsed config and whether a legacy `bdd:`
 * section was elevated. The CLI surfaces the migration warning from the flag.
 */
export function loadConfigDetail(source: string): {
  config: SddConfig;
  legacyBddElevated: boolean;
} {
  let data: unknown;
  try {
    data = parse(source);
  } catch (error) {
    throw new ConfigValidationError([
      `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  const elevated = elevateLegacyBdd(data);
  const result = sddConfigSchema.safeParse(elevated.data);
  if (!result.success) {
    const issues = result.error.issues.map((iss) => {
      const path = iss.path.map(String).join('/');
      return `${path || '<root>'}: ${iss.message}`;
    });
    throw new ConfigValidationError(issues);
  }
  // r59: compile change_id.pattern at load time so EVERY config-reading
  // command path (archive/skeleton/review included) fails fast on an invalid
  // regex instead of silently passing it through.
  const pattern = result.data.change_id?.pattern;
  if (pattern !== undefined && pattern !== null && pattern !== '') {
    try {
      compileChangeIdPattern(pattern);
    } catch (error) {
      // ChangeIdError message already carries the change_id.pattern path and
      // the regex engine's original error.
      throw new ConfigValidationError([(error as Error).message]);
    }
  }
  return { config: result.data, legacyBddElevated: elevated.legacyBddElevated };
}

export function loadConfig(source: string): SddConfig {
  return loadConfigDetail(source).config;
}
