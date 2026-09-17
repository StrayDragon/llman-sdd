/**
 * `config` command surface (r37/r38): read-only overview rendering and
 * non-interactive extra_skills management with comment-preserving writeback.
 */

import { parseDocument } from 'yaml';

import { loadConfig } from './load.ts';
import { EXTRA_SKILLS } from './schema.ts';

/** Render the five-element overview (v1 parity wording). */
export function renderConfigOverview(source: string): string[] {
  const config = loadConfig(source);
  const enabled = (config.extra_skills ?? []).length;
  const archive = config.archive;
  const archiveConfigured =
    archive !== null &&
    archive !== undefined &&
    (archive.strict_defer || archive.min_completion_ratio !== undefined);
  return [
    `schema: ${config.schema}`,
    `locale: ${config.locale}`,
    `extra_skills (enabled/total): ${enabled} / ${EXTRA_SKILLS.length}`,
    `bdd: ${config.bdd ? 'on' : 'off'}`,
    `archive: ${archiveConfigured ? 'configured' : 'default'}`,
  ];
}

export class ExtraSkillsError extends Error {}

/**
 * Add/remove extra_skills entries with full comment preservation: only the
 * `extra_skills` list node is touched, everything else (including the
 * `$schema` header comment) stays byte-identical.
 */
export function setExtraSkills(
  source: string,
  change: { set?: readonly string[]; unset?: readonly string[] },
): string {
  for (const name of [...(change.set ?? []), ...(change.unset ?? [])]) {
    if (!(EXTRA_SKILLS as readonly string[]).includes(name)) {
      throw new ExtraSkillsError(`unknown extra skill: ${name}`);
    }
  }
  const wanted = new Set<string>(loadConfig(source).extra_skills ?? []);
  for (const name of change.set ?? []) wanted.add(name);
  for (const name of change.unset ?? []) wanted.delete(name);

  const doc = parseDocument(source);
  const list = [...wanted].toSorted();
  if (list.length > 0) doc.set('extra_skills', list);
  else doc.delete('extra_skills');
  return doc.toString();
}

/** Shape of `config skills --json` (v1 parity). */
export function skillsJson(source: string): { enabled: string[]; available: readonly string[] } {
  return { enabled: [...(loadConfig(source).extra_skills ?? [])], available: EXTRA_SKILLS };
}
