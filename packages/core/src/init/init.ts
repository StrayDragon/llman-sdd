/**
 * init / --update orchestration (init-generators capability, r19).
 * Scaffold llmanspec/, write managed AGENTS.md blocks, render skills into
 * the .agents/skills namespace (SKILL.md per skill dir), and clean the
 * managed namespace.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function writeDefaultConfig(root: string, locale: string): void {
  const raw = locale === 'zh-Hans' ? DEFAULT_CONFIG_ZH_HANS : DEFAULT_CONFIG_EN;
  const dir = join(root, 'llmanspec');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.yaml'), prependSchemaHeader(raw, LLMANSPEC_SCHEMA_URL));
}

export interface InitResult {
  /** Skill dirs written, in render order. */
  skills: string[];
  /** llman-sdd-* directories removed by --update namespace cleanup. */
  removed: string[];
  configPath: string;
}

export function runInit(
  root: string,
  opts: { update: boolean; locale?: string; version: string },
): InitResult {
  const llmanspecDir = join(root, 'llmanspec');
  mkdirSync(llmanspecDir, { recursive: true });

  // 1) config: create with defaults if missing, then always load.
  const configPath = join(llmanspecDir, 'config.yaml');
  if (!existsSync(configPath)) writeDefaultConfig(root, opts.locale ?? 'en');
  const config = loadConfig(readFileSync(configPath, 'utf8'));

  // 2) scaffold directories.
  mkdirSync(join(llmanspecDir, 'specs'), { recursive: true });
  mkdirSync(join(llmanspecDir, 'changes', 'archive'), { recursive: true });
  const gitkeepSpecs = join(llmanspecDir, 'specs', '.gitkeep');
  if (!existsSync(gitkeepSpecs)) writeFileSync(gitkeepSpecs, '');
  const gitkeepArchive = join(llmanspecDir, 'changes', 'archive', '.gitkeep');
  if (!existsSync(gitkeepArchive)) writeFileSync(gitkeepArchive, '');

  // 3) AGENTS.md managed blocks (root + llmanspec), preserving content.
  const vars = buildTemplateVars(config, opts.version);
  const locales = localeFallbacks(config.locale);
  // skills render owns the unit registry; stubs reuse the same registry load.
  const skillTemplates = loadSkillTemplates(
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    TEMPLATES_ROOT,
    config,
    vars,
  );
  enforceEthicsGovernance(skillTemplates);

  const rootStubRaw = loadLocaleResource(
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    TEMPLATES_ROOT,
    locales,
    'agents-root-stub.md',
  );
  if (rootStubRaw !== null) {
    const agentsPath = join(root, 'AGENTS.md');
    const existing = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
    const body = renderTemplate(rootStubRaw, new Map(), vars);
    writeFileSync(agentsPath, updateFileWithMarkers(existing, body));
  }
  const llmanspecStubRaw = loadLocaleResource(
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    TEMPLATES_ROOT,
    locales,
    'llmanspec-agents-stub.md',
  );
  if (llmanspecStubRaw !== null) {
    const agentsPath = join(llmanspecDir, 'AGENTS.md');
    const existing = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
    const body = renderTemplate(llmanspecStubRaw, new Map(), vars);
    writeFileSync(agentsPath, updateFileWithMarkers(existing, body));
  }

  // 4) skills namespace cleanup (--update only): remove llman-sdd-* dirs
  // outside the candidate set; un-prefixed custom skills stay untouched.
  const removed: string[] = [];
  const skillsBase = join(root, '.agents', 'skills');
  if (opts.update && existsSync(skillsBase)) {
    const candidates = new Set(skillCandidates(config).map((f) => f.replace(/\.md$/u, '')));
    for (const entry of readdirSync(skillsBase)) {
      if (entry.startsWith('llman-sdd-') && !candidates.has(entry)) {
        rmSync(join(skillsBase, entry), { recursive: true, force: true });
        removed.push(entry);
      }
    }
  }

  // 5) write candidates: rendered product trimmed + single trailing newline.
  const skillsBase2 = join(root, '.agents', 'skills');
  for (const t of skillTemplates) {
    const dirName = t.name.replace(/\.md$/u, '');
    const skillDir = join(skillsBase2, dirName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `${t.content.trimEnd()}\n`);
  }

  return { skills: skillTemplates.map((t) => t.name.replace(/\.md$/u, '')), removed, configPath };
}
