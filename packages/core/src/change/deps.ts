/**
 * T22 single depends_on reader, two policies over one parse (design 3.1):
 *
 * - lenient (graph, peripheral-commands r30): missing/malformed/parse-failure
 *   all degrade to `[]`, non-string entries dropped, never throws.
 * - strict (validate, validation r73): non-list frontmatter reports
   `must be a list of change ID strings`; unknown refs are the caller's
   concern (the raw string list is returned for it to check).
 *
 * Parsing keys on the `yaml` package (parseDocument) via extractFrontmatter,
 * so quoting, block/flow styles, comments and numeric entries collapse into
 * one code path. A bare `depends_on:` (YAML null) reads as `[]` in both modes.
 */
import { parseDocument } from 'yaml';

import { extractFrontmatter } from './frontmatter.ts';

export type DepsList = { kind: 'list'; items: string[] } | { kind: 'malformed' };

function readDepsNode(frontmatter: string | null): DepsList {
  if (frontmatter === null) return { kind: 'list', items: [] };
  if (frontmatter.trim() === '') return { kind: 'list', items: [] };
  const doc = parseDocument(frontmatter);
  if (doc.errors.length > 0) return { kind: 'malformed' };
  const value = doc.toJS({ json: true }) as Record<string, unknown>;
  const node = value['depends_on'];
  if (node === undefined || node === null) return { kind: 'list', items: [] };
  if (!Array.isArray(node)) return { kind: 'malformed' };
  return {
    kind: 'list',
    items: node.filter((x): x is string => typeof x === 'string'),
  };
}

/** Lenient policy (graph): never throws, missing/malformed → []. */
export function readDepsLenient(text: string): string[] {
  const parsed = readDepsNode(extractFrontmatter(text) ?? cardYamlSource(text));
  return parsed.kind === 'list' ? parsed.items : [];
}

/**
 * r54 dual-format card reading: a fence-free frozen card is a plain YAML doc
 * whose FIRST line opens with `title:`/`depends_on:` — feed the whole text.
 * Proposal bodies never open with those keys, so no misfire.
 */
function cardYamlSource(input: string): string | null {
  const firstLine = input.trimStart().split('\n')[0] ?? '';
  return /^(title|depends_on):/u.test(firstLine) ? input : null;
}

/** Strict policy (validate): malformed frontmatter is reported, not swallowed. */
export function readDepsStrict(proposal: string): DepsList {
  return readDepsNode(extractFrontmatter(proposal));
}
