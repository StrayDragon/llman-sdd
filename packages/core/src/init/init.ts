/**
 * init / --update orchestration (init-generators capability, r19).
 * Scaffold llmanspec/, write managed AGENTS.md blocks, render skills into
 * the .agents/skills namespace (SKILL.md per skill dir), and clean the
 * managed namespace. Pure: all paths are ROOT-RELATIVE strings resolved by
 * the injected InitIo; template resources load through the injected
 * TemplateIo (runtimes point it at TEMPLATES_ROOT).
 */
import { join } from 'node:path';

import { loadConfig } from '../config/load.ts';
import { writeSddState } from '../context/sddState.ts';
import { renderTemplate } from '../templates/engine.ts';
import { localeFallbacks } from '../templates/locale.ts';
import {
  buildTemplateVars,
  enforceEthicsGovernance,
  loadLocaleResource,
  loadSkillTemplates,
  skillCandidates,
  type TemplateIo,
} from '../templates/skills.ts';
import {
  DEFAULT_CONFIG_EN,
  DEFAULT_CONFIG_ZH_HANS,
  LLMANSPEC_SCHEMA_URL,
  prependSchemaHeader,
} from './defaultConfig.ts';

export { effectiveCheckCommand } from '../templates/skills.ts';

const MARKER_START = '<!-- LLMANSPEC:START -->';
const MARKER_END = '<!-- LLMANSPEC:END -->';

/**
 * Marker-block update: replace block body if present, else prepend the block.
 * Formatter-friendly (0.0.78 parity): exactly one blank line after START and
 * after END; on the END boundary an existing blank line is preserved verbatim
 * and a missing one is inserted, so repeated updates never accumulate blanks.
 */
export function updateFileWithMarkers(content: string, body: string): string {
  if (content === '') {
    return `${MARKER_START}\n\n${body}\n${MARKER_END}\n`;
  }
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  if (start !== -1 && end !== -1) {
    if (end < start)
      throw new Error('Invalid marker state: end marker appears before start marker.');
    const suffix = content.slice(end + MARKER_END.length);
    return `${content.slice(0, start)}${MARKER_START}\n\n${body}\n${MARKER_END}${separatorAfterEndMarker(suffix)}`;
  }
  return `${MARKER_START}\n\n${body}\n${MARKER_END}\n\n${content}`;
}

/** END-boundary suffix, guaranteed blank-line-separated from following content. */
function separatorAfterEndMarker(suffix: string): string {
  const br = /^\r?\n/u.exec(suffix);
  if (br === null) return suffix === '' ? '\n' : `\n\n${suffix}`;
  const rest = suffix.slice(br[0].length);
  if (rest === '' || /^\r?\n/u.test(rest)) return suffix;
  return `${br[0]}${suffix}`;
}

export const TEMPLATES_ROOT = join(import.meta.dirname, '..', '..', 'templates');

/** Repo-root-relative filesystem effects needed by the init flow. */
export interface InitIo {
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, content: string): void;
  mkdirp(path: string): void;
  listDir(path: string): string[];
  removeDir(path: string): void;
}

function writeDefaultConfig(io: InitIo, locale: string): void {
  const raw = locale === 'zh-Hans' ? DEFAULT_CONFIG_ZH_HANS : DEFAULT_CONFIG_EN;
  io.mkdirp('llmanspec');
  io.writeText('llmanspec/config.yaml', prependSchemaHeader(raw, LLMANSPEC_SCHEMA_URL));
}

export interface InitResult {
  /** Skill dirs written, in render order ([] when skills injection is off). */
  skills: string[];
  /** llman-sdd-* directories removed by --update namespace cleanup. */
  removed: string[];
  configPath: string;
}

const SKILLS_BASE = '.agents/skills';

/** Managed AGENTS.md marker blocks (root + llmanspec), content-preserving. */
function writeManagedBlocks(
  io: InitIo,
  templates: TemplateIo,
  config: ReturnType<typeof loadConfig>,
  version: string,
): void {
  const vars = buildTemplateVars(config, version);
  const locales = localeFallbacks(config.locale);
  for (const [stubPath, agentsPath] of [
    ['agents-root-stub.md', 'AGENTS.md'],
    ['llmanspec-agents-stub.md', 'llmanspec/AGENTS.md'],
  ] as const) {
    const stubRaw = loadLocaleResource(templates, TEMPLATES_ROOT, locales, stubPath);
    if (stubRaw === null) continue;
    const existing = io.exists(agentsPath) ? io.readText(agentsPath) : '';
    const body = renderTemplate(stubRaw, new Map(), vars);
    io.writeText(agentsPath, updateFileWithMarkers(existing, body));
  }
}

export function runInit(
  io: InitIo,
  templates: TemplateIo,
  opts: { update: boolean; locale?: string; version: string; skills: boolean },
): InitResult {
  io.mkdirp('llmanspec');

  // 1) config: create with defaults if missing, then always load.
  const configPath = 'llmanspec/config.yaml';
  if (!io.exists(configPath)) writeDefaultConfig(io, opts.locale ?? 'en');
  const config = loadConfig(io.readText(configPath));

  // 1b) scaffold-state stamp: record the rendering version for drift notices
  // (version-awareness). Corrupt/missing state on later reads is silent-OK.
  writeSddState(io, opts.version);

  // 2) scaffold directories.
  io.mkdirp('llmanspec/specs');
  io.mkdirp('llmanspec/changes/archive');
  if (!io.exists('llmanspec/specs/.gitkeep')) io.writeText('llmanspec/specs/.gitkeep', '');
  if (!io.exists('llmanspec/changes/archive/.gitkeep')) {
    io.writeText('llmanspec/changes/archive/.gitkeep', '');
  }

  // 3) AGENTS.md managed blocks (root + llmanspec), preserving content.
  writeManagedBlocks(io, templates, config, opts.version);
  const vars = buildTemplateVars(config, opts.version);
  const skillTemplates = loadSkillTemplates(templates, TEMPLATES_ROOT, config, vars);
  enforceEthicsGovernance(skillTemplates);

  // 4) skills namespace cleanup (--update only): remove llman-sdd-* dirs
  // outside the candidate set; un-prefixed custom skills stay untouched.
  const removed: string[] = [];
  if (opts.skills && opts.update && io.exists(SKILLS_BASE)) {
    const candidates = new Set(skillCandidates(config).map((f) => f.replace(/\.md$/u, '')));
    for (const entry of io.listDir(SKILLS_BASE)) {
      if (entry.startsWith('llman-sdd-') && !candidates.has(entry)) {
        io.removeDir(`${SKILLS_BASE}/${entry}`);
        removed.push(entry);
      }
    }
  }

  // 5) write candidates: rendered product trimmed + single trailing newline.
  // Sub-root instances default to no skills injection (r93): the agent skill
  // surface stays at the repo root and sub-root navigation lives in the
  // managed blocks; --skills opts a sub-root in.
  if (!opts.skills) {
    return { skills: [], removed, configPath };
  }
  for (const t of skillTemplates) {
    const dirName = t.name.replace(/\.md$/u, '');
    io.mkdirp(`${SKILLS_BASE}/${dirName}`);
    io.writeText(`${SKILLS_BASE}/${dirName}/SKILL.md`, `${t.content.trimEnd()}\n`);
  }

  return { skills: skillTemplates.map((t) => t.name.replace(/\.md$/u, '')), removed, configPath };
}

/**
 * r93 --update sweep: refresh the managed blocks of one discovered sub-root
 * (blocks only — no scaffold, no config touch, no skills). Returns false for
 * a missing config (discovery guarantees validity; a race is not fatal).
 */
export function refreshSubRootBlocks(io: InitIo, templates: TemplateIo, version: string): boolean {
  const configPath = 'llmanspec/config.yaml';
  if (!io.exists(configPath)) return false;
  const config = loadConfig(io.readText(configPath));
  writeManagedBlocks(io, templates, config, version);
  return true;
}
