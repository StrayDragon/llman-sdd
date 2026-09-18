/**
 * Change-domain validation (r47) plus v1 parity gates: stage gating,
 * strict_defer escalation, completion ratio. Also the bdd run_command
 * placeholder expansion (r48).
 */

export type ChangeIssueLevel = 'ERROR' | 'WARNING';

export interface ChangeIssue {
  level: ChangeIssueLevel;
  message: string;
}

export interface ChangeCheckInput {
  name: string;
  stage: 'draft' | 'designed' | 'planned' | 'full';
  hasBinding: boolean;
  totalTasks: number;
  completedTasks: number;
}

export interface ChangeCheckConfig {
  strict_defer?: boolean | null;
  min_completion_ratio?: number | null;
}

export const STAGE_ORDER = ['draft', 'designed', 'planned', 'full'] as const;

export type StageGate = (typeof STAGE_ORDER)[number];

export interface ChangeCheckResult {
  id: string;
  valid: boolean;
  issues: ChangeIssue[];
}

/** Pure change-doc gate (v1 parity: pending tasks escalate with strict_defer). */
export function checkChangeDoc(
  input: ChangeCheckInput,
  config: ChangeCheckConfig,
  opts: { stage?: StageGate } = {},
): ChangeCheckResult {
  const issues: ChangeIssue[] = [];
  if (input.totalTasks > 0 && input.completedTasks < input.totalTasks) {
    const pending = input.totalTasks - input.completedTasks;
    issues.push({
      level: config.strict_defer ? 'ERROR' : 'WARNING',
      message: `${pending} unchecked task(s) in tasks.md`,
    });
  }
  if (
    config.min_completion_ratio !== undefined &&
    config.min_completion_ratio !== null &&
    input.totalTasks > 0 &&
    input.completedTasks / input.totalTasks < config.min_completion_ratio
  ) {
    issues.push({
      level: 'ERROR',
      message: `completion ratio below archive.min_completion_ratio (${config.min_completion_ratio})`,
    });
  }
  if (!input.hasBinding) {
    issues.push({
      level: 'WARNING',
      message: 'change has no branch binding (not started/attached)',
    });
  }
  if (opts.stage !== undefined) {
    const currentIdx = STAGE_ORDER.indexOf(input.stage);
    const requiredIdx = STAGE_ORDER.indexOf(opts.stage);
    if (currentIdx < requiredIdx) {
      issues.push({
        level: 'ERROR',
        message: `stage \`${input.stage}\` is below the required \`${opts.stage}\``,
      });
    }
  }
  return { id: input.name, valid: issues.every((i) => i.level !== 'ERROR'), issues };
}

export interface PlaceholderTarget {
  featureDir: string;
  featureName: string;
  featurePath: string;
}

/** True when run_command carries any r48 placeholder. */
export function hasPlaceholders(runCommand: string): boolean {
  return /\{feature_dir\}|\{feature_name\}|\{feature_path\}/u.test(runCommand);
}

/** Expand {feature_dir}/{feature_name}/{feature_path} for one target (r48). */
export function expandRunCommand(runCommand: string, target: PlaceholderTarget): string {
  return runCommand
    .replaceAll('{feature_dir}', target.featureDir)
    .replaceAll('{feature_name}', target.featureName)
    .replaceAll('{feature_path}', target.featurePath);
}
