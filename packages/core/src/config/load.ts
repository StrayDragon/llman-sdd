/**
 * Config loading (config-schema capability): parse YAML text + validate
 * against the zod contract. Pure — no filesystem access; callers read the
 * file and hand over the string.
 *
 * Validation failures report at most 5 issue lines (r6), each prefixed with
 * its field path.
 */
import { parse } from 'yaml';

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

export function loadConfig(source: string): SddConfig {
  let data: unknown;
  try {
    data = parse(source);
  } catch (error) {
    throw new ConfigValidationError([
      `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  const result = sddConfigSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((iss) => {
      const path = iss.path.map(String).join('/');
      return `${path || '<root>'}: ${iss.message}`;
    });
    throw new ConfigValidationError(issues);
  }
  return result.data;
}
