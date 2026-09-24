/**
 * llmanspec/config.yaml contract (config-schema capability): field-for-field
 * alignment with v1 (crates/llman-sdd/src/sdd/project/config.rs). Unknown
 * keys are tolerated (v1 schema sets no additionalProperties:false); field
 * names stay snake_case for v1-config readability.
 */
import { z } from 'zod';

export const EXTRA_SKILLS = [
  'llman-sdd-continue',
  'llman-sdd-ff',
  'llman-sdd-validate',
  'llman-sdd-arch-review',
  'llman-sdd-wayfinder',
  'llman-sdd-research',
] as const;

export const bddSchema = z.object({
  framework: z
    .string()
    .default('')
    .describe(
      'BDD framework identifier (optional). Only used to derive a default run_command when run_command is unset.',
    ),
  run_command: z
    .string()
    .nullish()
    .describe(
      'Harness command executed by validate for spec targets (skip with --no-check). Placeholders: {feature_path}, {feature_dir}, {feature_name}; without placeholders it runs once per validate invocation (batch-once).',
    ),
  verify_prompt: z.string().nullish().describe('Extra prompt text injected during verify phase.'),
});

export const archiveSchema = z.object({
  strict_defer: z
    .boolean()
    .nullish()
    .describe(
      'When true, unchecked tasks without a defer link are errors (not just warnings). Default: false.',
    ),
});

export const sddSchema = z.object({
  branch_prefix: z
    .string()
    .nullish()
    .describe('Prefix for feature branches created by `change start`. Default: "sdd/".'),
  worktree_root: z
    .string()
    .nullish()
    .describe('Root directory for worktrees created by `change start --worktree`.'),
  worktree_naming: z
    .enum(['id', 'hash'])
    .nullish()
    .describe(
      'Worktree directory naming: "id" (default) or "hash" (base32(sha256(change_id))[:8]).',
    ),
  merge_method: z
    .enum(['squash', 'ff'])
    .nullish()
    .describe('Default merge method for finalize/archive close-out. "squash" (default) or "ff".'),
});

export const changeIdSchema = z.object({
  pattern: z
    .string()
    .nullish()
    .describe('Regex active change ids MUST fully match (anchored full-match).'),
  template: z
    .string()
    .nullish()
    .describe('Template rendered by `change new --from` with preset vars.'),
});

export const sddConfigSchema = z.object({
  schema: z.literal('spec-driven').describe('Schema identifier. Must be "spec-driven".'),
  locale: z.string().default('en').describe('Locale used for SDD templates and skills.'),
  extra_skills: z
    .array(z.enum(EXTRA_SKILLS))
    .nullish()
    .describe('Additional optional SDD skills to enable (extend candidates on init --update).'),
  archive: archiveSchema
    .nullish()
    .describe('Archive behaviour settings (defer tracking, completion gates).'),
  bdd: bddSchema
    .nullish()
    .describe(
      'BDD integration settings. When defined, enables feature-as-spec mode and BDD-aware verify prompts.',
    ),
  sdd: sddSchema
    .nullish()
    .describe('Unified Git-native flow tuning (branch prefix, worktree, merge method).'),
  change_id: changeIdSchema
    .nullish()
    .describe('Optional machine-readable change id naming convention.'),
});

export type SddConfig = z.output<typeof sddConfigSchema>;
export type SddConfigInput = z.input<typeof sddConfigSchema>;
