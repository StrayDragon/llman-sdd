/**
 * change_id contract (r59/r60): pattern compile-check at load time, validate
 * ERROR for active changes violating the pattern, and `change new --from`
 * template rendering (nunjucks Strict) with the v1 preset variables.
 */

import nunjucks from 'nunjucks';

import { harvestUniqueNumbers, type NextIdIo } from '../change/nextId.ts';

export class ChangeIdError extends Error {}

/** Compile-check a configured change_id.pattern (r59). */
export function compileChangeIdPattern(pattern: string | null | undefined): RegExp | null {
  if (pattern === null || pattern === undefined || pattern === '') return null;
  try {
    return new RegExp(pattern, 'u');
  } catch (error) {
    throw new ChangeIdError(`change_id.pattern is not a valid regex: ${(error as Error).message}`);
  }
}

export interface ChangeIdVars {
  /** whole-tree next free number (v1 llman_sdd_unique_id) */
  llman_sdd_unique_id: number;
  /** explicit --verb value; undefined when not provided (Strict render errors) */
  verb?: string;
  /** slugified description subject */
  subject: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Render a change_id.template with v1 preset vars (r60). Strict semantics:
 * referencing a variable that was not provided errors out (v1 parity —
 * `{{ verb }}` without --verb fails).
 */
export function renderChangeIdTemplate(template: string, vars: ChangeIdVars): string {
  // Named pre-check (v1 parity): referencing an unprovided variable errors with
  // the variable name and the preset list, instead of a generic render error.
  const provided = new Set(
    Object.keys(vars).filter((k) => vars[k as keyof ChangeIdVars] !== undefined),
  );
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/gu)) {
    const name = m[1] as string;
    if (!provided.has(name)) {
      throw new ChangeIdError(
        `change_id.template references unprovided variable(s): ${name} — preset vars are llman_sdd_unique_id, verb, subject, date (pass --verb when it uses {{ verb }})`,
      );
    }
  }
  const env = new nunjucks.Environment(undefined, { throwOnUndefined: true });
  const rendered = env.renderString(template, vars as unknown as Record<string, unknown>).trim();
  if (rendered === '') throw new ChangeIdError('change_id.template rendered to an empty id');
  return rendered;
}

/** Whole-tree next free number for the llman_sdd_unique_id preset var. */
export function nextUniqueNumber(io: NextIdIo, llmanspecRoot: string): number {
  return harvestUniqueNumbers(io, llmanspecRoot).nextNumber;
}
