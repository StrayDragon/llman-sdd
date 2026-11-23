/**
 * `config` command surface: read-only overview. Skill install is `init --update`.
 */

import { loadConfig } from './load.ts';

/** Render the overview (schema, locale, specs, archive). */
export function renderConfigOverview(source: string): string[] {
  const config = loadConfig(source);
  const archive = config.archive;
  const archiveConfigured =
    archive !== null && archive !== undefined && archive.strict_defer === true;
  return [
    `schema: ${config.schema}`,
    `locale: ${config.locale}`,
    `specs: ${config.specs ? 'on' : 'off'}`,
    `archive: ${archiveConfigured ? 'configured' : 'default'}`,
  ];
}
