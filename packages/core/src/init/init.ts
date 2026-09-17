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

export { effectiveRunCommand } from '../templates/skills.ts';

const MARKER_START = '<!-- LLMANSPEC:START -->';
const MARKER_END = '<!-- LLMANSPEC:END -->';

/** Marker-block update: replace block body if present, else prepend the block. */
export function updateFileWithMarkers(content: string, body: string): string {
  if (content === '') {
    return `${MARKER_START}\n${body}\n${MARKER_END}\n`;
  }
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  if (start !== -1 && end !== -1) {
    if (end < start)
      throw new Error('Invalid marker state: end marker appears before start marker.');
    return `${content.slice(0, start)}${MARKER_START}\n${body}\n${MARKER_END}${content.slice(end + MARKER_END.length)}`;
  }
  return `${MARKER_START}\n${body}\n${MARKER_END}\n${content}`;
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
  /** Skill dirs written, in render order. */
  skills: string[];
  /** llman-sdd-* directories removed by --update namespace cleanup. */
  removed: string[];
  configPath: string;
}

const SKILLS_BASE = '.agents/skills';

export function runInit(
  io: InitIo,
  templates: TemplateIo,
  opts: { update: boolean; locale?: string; version: string },
): InitResult {
  io.mkdirp('llmanspec');

  // 1) config: create with defaults if missing, then always load.
  const configPath = 'llmanspec/config.yaml';
  if (!io.exists(configPath)) writeDefaultConfig(io, opts.locale ?? 'en');
  const config = loadConfig(io.readText(configPath));

  // 2) scaffold directories.
  io.mkdirp('llmanspec/specs');
  io.mkdirp('llmanspec/changes/archive');
  if (!io.exists('llmanspec/specs/.gitkeep')) io.writeText('llmanspec/specs/.gitkeep', '');
  if (!io.exists('llmanspec/changes/archive/.gitkeep')) {
    io.writeText('llmanspec/changes/archive/.gitkeep', '');
  }

  // 3) AGENTS.md managed blocks (root + llmanspec), preserving content.
  const vars = buildTemplateVars(config, opts.version);
  const locales = localeFallbacks(config.locale);
  const skillTemplates = loadSkillTemplates(templates, TEMPLATES_ROOT, config, vars);
  enforceEthicsGovernance(skillTemplates);

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

  // 4) skills namespace cleanup (--update only): remove llman-sdd-* dirs
  // outside the candidate set; un-prefixed custom skills stay untouched.
  const removed: string[] = [];
  if (opts.update && io.exists(SKILLS_BASE)) {
    const candidates = new Set(skillCandidates(config).map((f) => f.replace(/\.md$/u, '')));
    for (const entry of io.listDir(SKILLS_BASE)) {
      if (entry.startsWith('llman-sdd-') && !candidates.has(entry)) {
        io.removeDir(`${SKILLS_BASE}/${entry}`);
        removed.push(entry);
      }
    }
  }

  // 5) write candidates: rendered product trimmed + single trailing newline.
  for (const t of skillTemplates) {
    const dirName = t.name.replace(/\.md$/u, '');
    io.mkdirp(`${SKILLS_BASE}/${dirName}`);
    io.writeText(`${SKILLS_BASE}/${dirName}/SKILL.md`, `${t.content.trimEnd()}\n`);
  }

  return { skills: skillTemplates.map((t) => t.name.replace(/\.md$/u, '')), removed, configPath };
}
