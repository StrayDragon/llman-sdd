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
import { removedBindingIssues, sddConfigSchema, type SddConfig } from './schema.ts';

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

export function loadConfig(source: string): SddConfig {
  let data: unknown;
  try {
    data = parse(source);
  } catch (error) {
    throw new ConfigValidationError([
      `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  // r5: fail fast on removed binding shapes with the dedicated fix-action
  // message (feeds the standard 5-issue truncation).
  const removed = removedBindingIssues(data);
  if (removed.length > 0) throw new ConfigValidationError(removed);
  const result = sddConfigSchema.safeParse(data);
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
  return result.data;
}
