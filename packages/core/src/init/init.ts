/**
 * init / --update orchestration (init-generators capability, r19).
 * Scaffold llmanspec/, write managed AGENTS.md blocks, render skills into
 * the .agents/skills namespace (SKILL.md per skill dir), and clean the
 * managed namespace. Pure: all paths are ROOT-RELATIVE strings resolved by
 * the injected InitIo; template resources load through the injected
 * TemplateIo (runtimes point it at TEMPLATES_ROOT).
 */
import { join } from 'node:path';

import { CHANGES_DIR, SPECS_DIR } from '../change/lifecycle.ts';
import { loadConfigDetail } from '../config/load.ts';
import type { SddConfig } from '../config/schema.ts';
import { writeSddState } from '../context/sddState.ts';
import { DEFAULT_LOCALE, localeFallbacks, normalizeLocale } from '../locale.ts';
import { renderTemplate } from '../templates/engine.ts';
import {
  buildTemplateVars,
  enforceEthicsGovernance,
  loadLocaleResource,
  loadSkillTemplates,
  skillCandidates,
  type TemplateIo,
} from '../templates/skills.ts';
import { type FsPort } from '../util/fsPort.ts';
import { DEFAULT_CONFIGS, LLMANSPEC_SCHEMA_URL, prependSchemaHeader } from './defaultConfig.ts';

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
export type InitIo = Pick<
  FsPort,
  'exists' | 'readText' | 'writeText' | 'mkdirp' | 'listDir' | 'removeDir'
>;

function writeDefaultConfig(io: InitIo, locale: string): void {
  const raw = DEFAULT_CONFIGS[normalizeLocale(locale)] ?? DEFAULT_CONFIGS[DEFAULT_LOCALE]!;
  io.mkdirp('llmanspec');
  io.writeText('llmanspec/config.yaml', prependSchemaHeader(raw, LLMANSPEC_SCHEMA_URL));
}

/**
 * Effective-locale precedence (init-generators r50): an explicit `locale` key
 * in the workspace config wins; a CLI option fills a missing key; the built-in
 * default (r18-normalized `zh-Hans`, already baked into config.locale here) is
 * the floor. Per-instance: callers resolve per workspace root, no
 * cross-instance inheritance.
 */
export function resolveEffectiveLocale(input: {
  configLocale: string;
  configLocaleExplicit: boolean;
  optionLocale?: string;
}): string {
  if (input.configLocaleExplicit) return input.configLocale;
  return input.optionLocale ?? input.configLocale;
}

/**
 * Config as rendered: resolve the effective locale per r50 and attach the
 * missing-key WARNING when an existing config lacks the key (a freshly
 * written default config always carries the key, so no warning there).
 */
function withEffectiveLocale(
  detail: ReturnType<typeof loadConfigDetail>,
  optionLocale: string | undefined,
  configExisted: boolean,
  onWarning: ((message: string) => void) | undefined,
): SddConfig {
  const { config, localeExplicit } = detail;
  if (localeExplicit) return config;
  const effective = resolveEffectiveLocale({
    configLocale: config.locale,
    configLocaleExplicit: false,
    optionLocale,
  });
  if (configExisted) {
    onWarning?.(
      `WARNING: config.yaml has no explicit 'locale' key; rendering fell back to '${effective}' (set locale: in config.yaml or pass --locale)`,
    );
  }
  return { ...config, locale: effective };
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
  config: SddConfig,
  version: string,
): void {
  const vars = buildTemplateVars(config, version);
  const locales = localeFallbacks(config.locale);
  for (const [stubPath, agentsPath] of [
    ['agents-root-stub.md', 'AGENTS.md'],
    ['llmanspec-agents-stub.md', 'llmanspec/AGENTS.md'],
  ] as const) {
    const stubRaw = loadLocaleResource(templates, TEMPLATES_ROOT, locales, stubPath);
    if (stubRaw === null) {
      // r19/r18: a missing built-in resource is a broken installation, not a
      // no-op — silent skips shipped AGENTS.md-less workspaces before.
      throw new Error(
        `template resource missing: ${stubPath} (locales tried: ${locales.join(', ')})`,
      );
    }
    const existing = io.exists(agentsPath) ? io.readText(agentsPath) : '';
    const body = renderTemplate(stubRaw, new Map(), vars);
    io.writeText(agentsPath, updateFileWithMarkers(existing, body));
  }
}

export function runInit(
  io: InitIo,
  templates: TemplateIo,
  opts: {
    update: boolean;
    locale?: string;
    version: string;
    skills: boolean;
    onWarning?: (message: string) => void;
  },
): InitResult {
  io.mkdirp('llmanspec');

  // 1) config: create with defaults if missing, then always load.
  const configPath = 'llmanspec/config.yaml';
  const configExisted = io.exists(configPath);
  if (!configExisted) writeDefaultConfig(io, opts.locale ?? DEFAULT_LOCALE);
  const config = withEffectiveLocale(
    loadConfigDetail(io.readText(configPath)),
    opts.locale,
    configExisted,
    opts.onWarning,
  );

  // 1b) scaffold-state stamp: record the rendering version for drift notices
  // (version-awareness). Corrupt/missing state on later reads is silent-OK.
  writeSddState(io, opts.version);

  // 2) scaffold directories.
  io.mkdirp(SPECS_DIR);
  io.mkdirp(`${CHANGES_DIR}/archive`);
  if (!io.exists('llmanspec/specs/.gitkeep')) io.writeText('llmanspec/specs/.gitkeep', '');
  if (!io.exists(`${CHANGES_DIR}/archive/.gitkeep`)) {
    io.writeText(`${CHANGES_DIR}/archive/.gitkeep`, '');
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
export function refreshSubRootBlocks(
  io: InitIo,
  templates: TemplateIo,
  version: string,
  onWarning?: (message: string) => void,
): boolean {
  const configPath = 'llmanspec/config.yaml';
  if (!io.exists(configPath)) return false;
  const config = withEffectiveLocale(
    loadConfigDetail(io.readText(configPath)),
    undefined,
    true,
    onWarning,
  );
  writeManagedBlocks(io, templates, config, version);
  return true;
}
