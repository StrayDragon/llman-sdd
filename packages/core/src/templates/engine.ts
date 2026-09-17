/**
 * Template engine (init-generators capability, r17): nunjucks adapter with
 * minijinja-compatible semantics used by v1 — string-only globals, undefined
 * renders empty (Lenient), nested `unit(id)` expansion capped at 32, and
 * trailing whitespace trimmed from the final product.
 */
import * as nunjucks from 'nunjucks';

export const MAX_UNIT_NESTING_DEPTH = 32;

export type UnitRegistry = Map<string, string>;

export class MissingUnitError extends Error {
  constructor(id: string) {
    super(`missing template unit '${id}'`);
    this.name = 'MissingUnitError';
  }
}

export function renderWithUnits(
  raw: string,
  units: UnitRegistry,
  vars: Record<string, string>,
  depth = 0,
): string {
  if (depth > MAX_UNIT_NESTING_DEPTH) {
    throw new Error(`unit nesting exceeded ${MAX_UNIT_NESTING_DEPTH}`);
  }
  // minijinja keep_trailing_newline=false: a single trailing newline of the
  // template SOURCE is stripped before rendering (v1 parity). \r? first —
  // stripping \n alone would strand a trailing \r for CRLF sources.
  const source = raw.replace(/\r?\n$/u, '');
  const env = new nunjucks.Environment(null, { autoescape: false });
  for (const [key, value] of Object.entries(vars)) {
    env.addGlobal(key, value);
  }
  env.addGlobal('unit', (id: string): string => {
    const content = units.get(id);
    if (content === undefined) throw new MissingUnitError(id);
    return renderWithUnits(content, units, vars, depth + 1);
  });
  return env.renderString(source, {});
}

/** Render a template product: lenient render + trailing-whitespace trim. */
export function renderTemplate(
  raw: string,
  units: UnitRegistry,
  vars: Record<string, string>,
): string {
  return renderWithUnits(raw, units, vars, 0).trimEnd();
}
