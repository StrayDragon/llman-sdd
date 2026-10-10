import type { SddConfig } from '../config/schema.ts';
import { renderTemplate, type UnitRegistry } from './engine.ts';
/**
 * Skills rendering + init orchestration (init-generators capability, r19).
 * Port of predecessor templates.rs / update_skills.rs / init.rs semantics.
 */
import { localeFallbacks } from './locale.ts';

export const DEFAULT_SKILL_FILES: readonly string[] = [
  'llman-sdd-explore.md',
  'llman-sdd-propose.md',
  'llman-sdd-draft.md',
  'llman-sdd-apply.md',
  'llman-sdd-verify.md',
  'llman-sdd-quick.md',
  'llman-sdd-specs-compact.md',
  'llman-sdd-archive.md',
  'llman-sdd-graph.md',
  'llman-sdd-apply-cycle.md',
];

export const OPTIONAL_SKILL_FILES: readonly string[] = [
  'llman-sdd-continue.md',
  'llman-sdd-ff.md',
  'llman-sdd-validate.md',
  'llman-sdd-arch-review.md',
  'llman-sdd-wayfinder.md',
  'llman-sdd-research.md',
];

export const UNIT_FILES: readonly string[] = [
  'skills/validation-hints.md',
  'skills/human-readable-summary.md',
  'skills/git-native-flow.md',
  'skills/git-native-flow-brief.md',
  'skills/stage-guard.md',
  'skills/ethics-governance.md',
  'skills/version-drift.md',
  'skills/review-stamp.md',
  'spec/feature-contract.md',
  'skills/structured-protocol.md',
  'skills/cli-footer.md',
  'workflow/archive-freeze-guidance.md',
];

export const ETHICS_KEYS: readonly string[] = [
  'ethics.risk_level',
  'ethics.prohibited_actions',
  'ethics.required_evidence',
  'ethics.refusal_contract',
  'ethics.escalation_policy',
];

/** Framework-derived check_command (predecessor config.rs effective_run_command). */
export function effectiveCheckCommand(specs: NonNullable<SddConfig['specs']>): string {
  if (specs.check_command) return specs.check_command;
  switch (specs.framework ?? '') {
    case 'pytest-bdd':
      return 'pytest {feature_dir} -k {feature_name} -v';
    case 'rstest-bdd':
      return 'cargo test --features bdd';
    case 'cucumber-js':
      return 'npx cucumber-js {feature_path}';
    case 'behave':
      return 'behave {feature_path}';
    default:
      return "echo 'No check_command configured. Set specs.check_command in config.yaml'";
  }
}

/** All-string globals (predecessor BTreeMap<String, String> semantics). */
export function buildTemplateVars(config: SddConfig, version: string): Record<string, string> {
  const vars: Record<string, string> = { llman_version: version };
  if (config.specs) {
    vars['specs_enabled'] = 'true';
    vars['specs_framework'] = config.specs.framework ?? '';
    vars['specs_check_command'] = effectiveCheckCommand(config.specs);
    if (config.specs.verify_prompt) vars['specs_verify_prompt'] = config.specs.verify_prompt;
  }
  const extras = new Set<string>(config.extra_skills ?? []);
  for (const name of OPTIONAL_SKILL_FILES) {
    const stem = name.replace(/\.md$/u, '');
    const key = `extra_skill_${stem.replace(/^llman-sdd-/u, '').replaceAll('-', '_')}`;
    if (extras.has(stem)) vars[key] = 'true';
  }
  return vars;
}

export interface TemplateIo {
  exists(path: string): boolean;
  readText(path: string): string;
}

/** Locale-fallback resource load: first locale in the chain that has the file. */
export function loadLocaleResource(
  io: TemplateIo,
  templatesRoot: string,
  locales: readonly string[],
  relativePath: string,
): string | null {
  for (const locale of locales) {
    const path = `${templatesRoot}/${locale}/${relativePath}`;
    if (io.exists(path)) return io.readText(path);
  }
  return null;
}

export function loadUnitRegistry(
  io: TemplateIo,
  templatesRoot: string,
  locales: readonly string[],
): UnitRegistry {
  const units: UnitRegistry = new Map();
  for (const unitFile of UNIT_FILES) {
    const id = unitFile.replace(/\.md$/u, '');
    const content = loadLocaleResource(io, templatesRoot, locales, `units/${unitFile}`);
    if (content !== null) units.set(id, content);
  }
  return units;
}

export interface SkillTemplate {
  name: string;
  content: string;
}

export function skillCandidates(config: SddConfig): string[] {
  const extras: readonly string[] = config.extra_skills ?? [];
  return [
    ...DEFAULT_SKILL_FILES,
    ...OPTIONAL_SKILL_FILES.filter((f) => {
      const stem = f.replace(/\.md$/u, '');
      return extras.includes(stem);
    }),
  ];
}

export function loadSkillTemplates(
  io: TemplateIo,
  templatesRoot: string,
  config: SddConfig,
  vars: Record<string, string>,
): SkillTemplate[] {
  const locales = localeFallbacks(config.locale);
  const units = loadUnitRegistry(io, templatesRoot, locales);
  const templates: SkillTemplate[] = [];
  for (const skillFile of skillCandidates(config)) {
    const raw = loadLocaleResource(io, templatesRoot, locales, `skills/${skillFile}`);
    if (raw === null) {
      throw new Error(`template not found: skills/${skillFile}`);
    }
    templates.push({ name: skillFile, content: renderTemplate(raw, units, vars) });
  }
  return templates;
}

/** Ethics gate: every rendered skill must carry all five governance keys. */
export function enforceEthicsGovernance(templates: readonly SkillTemplate[]): void {
  for (const t of templates) {
    for (const key of ETHICS_KEYS) {
      if (!t.content.includes(key)) {
        throw new Error(`missing required ethics governance key '${key}' in template '${t.name}'`);
      }
    }
  }
}
