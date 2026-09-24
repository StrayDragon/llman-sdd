/**
 * `config` command surface (r37/r38): read-only overview rendering and the
 * skills listing shape (the extra_skills write path was removed with
 * config-command r38).
 */

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

/** Shape of `config skills --json` (v1 parity). */
export function skillsJson(source: string): { enabled: string[]; available: readonly string[] } {
  return { enabled: [...(loadConfig(source).extra_skills ?? [])], available: EXTRA_SKILLS };
}
