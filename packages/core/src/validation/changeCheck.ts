import { stageFor } from '../change/collect.ts';
import { extractFrontmatter, readBinding } from '../change/frontmatter.ts';
import { parseTaskCheckboxes } from '../change/tasks.ts';
/**
 * Change-domain validation (v1 `commands/validate.rs` change path parity):
 * frontmatter/depends_on gates, design/tasks constraints, completeness stage
 * INFO, pattern gate and task gates. IO + git injected (pure).
 */
import type { GitLike } from '../git/spawnGit.ts';

export type ChangeIssueLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface ChangeIssue {
  level: ChangeIssueLevel;
  /** v1-style anchor (issue path), e.g. `proposal.md/frontmatter.depends_on`. */
  path: string;
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
  change_id_pattern?: string | null;
}

export interface ChangeFsIoLite {
  exists(path: string): boolean;
  readText(path: string): string;
  listDir(path: string): string[];
  isDirectory(path: string): boolean;
}

export const STAGE_ORDER = ['draft', 'designed', 'planned', 'full'] as const;

export type StageGate = (typeof STAGE_ORDER)[number];

export interface ChangeCheckResult {
  id: string;
  valid: boolean;
  issues: ChangeIssue[];
}

/** Legacy pure gate (r47 surface) — kept for existing callers/tests. */
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
      path: 'tasks.md',
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
      path: 'tasks.md',
      message: `completion ratio below archive.min_completion_ratio (${config.min_completion_ratio})`,
    });
  }
  if (!input.hasBinding) {
    issues.push({
      level: 'WARNING',
      path: 'binding',
      message: 'change has no branch binding (not started/attached)',
    });
  }
  if (config.change_id_pattern) {
    const re = new RegExp(config.change_id_pattern, 'u');
    if (!re.test(input.name)) {
      issues.push({
        level: 'ERROR',
        path: 'change-id',
        message: `Change id '${input.name}' does not match change_id.pattern '${config.change_id_pattern}' (sdd-workflow r29; scope: active changes only, archive/legacy shapes are not back-checked).`,
      });
    }
  }
  if (opts.stage !== undefined) {
    const currentIdx = STAGE_ORDER.indexOf(input.stage);
    const requiredIdx = STAGE_ORDER.indexOf(opts.stage);
    if (currentIdx < requiredIdx) {
      issues.push({
        level: 'ERROR',
        path: 'stage',
        message: `stage \`${input.stage}\` is below the required \`${opts.stage}\``,
      });
    }
  }
  return { id: input.name, valid: issues.every((i) => i.level !== 'ERROR'), issues };
}

export type ChangeValidationConfig = ChangeCheckConfig;

const COMPLETENESS: Record<string, string> = {
  draft:
    "Change is in 'draft' stage (next: add design.md + tasks.md, then `llman-sdd change start <id>` to enter a feature branch)",
  designed:
    "Change is in 'designed' stage (next: add tasks.md to reach 'planned', then `llman-sdd change start` to enter feature branch and reach 'full')",
  planned:
    "Change is in 'planned' stage (next: `llman-sdd change start` to enter feature branch and reach 'full')",
  full: "Change is bound and stage is 'full' (verify readiness via `llman-sdd show <id> --json` readyToImplement)",
};

/**
 * File-aware change validation with v1 messages/paths (used by the validate
 * command). `strict` escalates WARNING issues to ERROR (v1 build_report).
 * `git` (optional) enables the r63 completeness WARNINGs — Full-not-ready
 * with skill guidance, per change.
 */
export function validateChange(
  io: ChangeFsIoLite,
  root: string,
  id: string,
  config: ChangeValidationConfig,
  opts: { stage?: StageGate; strict?: boolean; git?: GitLike } = {},
): ChangeCheckResult {
  const issues: ChangeIssue[] = [];
  const push = (level: ChangeIssueLevel, path: string, message: string): void => {
    issues.push({ level, path, message });
  };

  const dir = `${root}/llmanspec/changes/${id}/`;
  const baseDir = `${root}/llmanspec/changes`;
  const proposal = `${dir}proposal.md`;
  // Probed once here: shared by the stage inference below and the --stage
  // artifact gate at the end (v1 issue order preserved).
  const hasDesign = io.exists(`${dir}design.md`);
  const hasTasks = io.exists(`${dir}tasks.md`);
  if (!io.exists(proposal)) {
    push('ERROR', 'proposal.md', 'Change is missing proposal.md.');
  } else {
    const text = io.readText(proposal);
    const fm = extractFrontmatter(text) ?? '';
    const fmLines = fm.split('\n').map((l) => l.trim());

    for (const key of ['depends_on', 'blocks'] as const) {
      const lineIdx = fmLines.findIndex((l) => l.startsWith(`${key}:`));
      if (lineIdx === -1) continue;
      const value = (fmLines[lineIdx] ?? '').slice(key.length + 1).trim();
      let items: string[] = [];
      if (value === '') {
        for (const l of fmLines.slice(lineIdx + 1)) {
          if (l.startsWith('- ')) items.push(l.slice(2).trim());
          else if (l === '') continue;
          else break;
        }
      } else if (value.startsWith('[')) {
        items = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
      } else {
        push(
          'ERROR',
          `proposal.md/frontmatter.${key}`,
          `proposal.md ${key} must be a list of change ID strings`,
        );
        continue;
      }
      for (const item of items) {
        if (item === '') continue;
        if (/^\d/u.test(item)) {
          push(
            'ERROR',
            `proposal.md/frontmatter.${key}`,
            `proposal.md ${key} must be a list of change ID strings`,
          );
          continue;
        }
        const depDir = `${baseDir}/${item}`;
        const archived = `${baseDir}/archive`;
        if (
          !io.exists(`${depDir}/proposal.md`) &&
          !io.exists(dir.replace(/\/[^/]+\/$/u, '/archive/')) &&
          !io.listDir(archived).some((n) => n.endsWith(`-${item}`))
        ) {
          push(
            'ERROR',
            `proposal.md/frontmatter.${key}`,
            `proposal.md ${key} references unknown change: ${item}`,
          );
        }
      }
    }

    // Unknown frontmatter field gate (v1).
    for (const l of fmLines) {
      if (l === '' || l.startsWith('-') || l.startsWith('#')) continue;
      const m = l.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/u);
      if (m && m[1] !== undefined && !ALLOWED_FIELDS.includes(m[1])) {
        push(
          'ERROR',
          'proposal.md/frontmatter',
          `proposal.md frontmatter has unknown field '${m[1]}'; allowed fields are: ${ALLOWED_FIELDS.join(', ')}. Stage is inferred from on-disk artifacts (run \`llman-sdd show\` / \`llman-sdd list\`); do not store lifecycle state in frontmatter.`,
        );
      }
    }

    const binding = readBinding(text);
    // stageFor (change/collect) is the monotonic stage SSOT (r34).
    const stage = stageFor(hasDesign, hasTasks, binding !== null);

    if (hasTasks && !hasDesign) {
      push(
        'ERROR',
        'proposal.md/frontmatter',
        'Change has tasks.md but missing design.md. Tasks MUST be generated after design decisions are documented. Create design.md first, then regenerate tasks.md.',
      );
    }

    if (hasTasks) {
      const { completed, total } = parseTaskCheckboxes(io.readText(`${dir}tasks.md`));
      if (total > 0 && completed < total) {
        const n = total - completed;
        push(
          config.strict_defer ? 'ERROR' : 'WARNING',
          'tasks.md',
          `${n} unchecked task(s) in tasks.md`,
        );
      }
    }

    // completeness INFO (v1 surface).
    push('INFO', 'completeness', COMPLETENESS[stage] ?? '');

    // r63: Full-but-not-ready WARNING with skill guidance (v1 r1 surface).
    if (opts.git !== undefined && binding !== null && stage === 'full') {
      const needs =
        text.match(/^needs_specs_change:\s*(true|false)\s*$/mu)?.[1] !== undefined
          ? text.match(/^needs_specs_change:\s*(true|false)\s*$/mu)?.[1] === 'true'
          : true;
      const touched =
        opts.git.runOpt(['diff', '--name-only', `${binding.baseBranch}...${binding.branch}`]) ?? '';
      const landed = touched.includes('llmanspec/specs/');
      if (!landed && needs) {
        push(
          'WARNING',
          'proposal.md',
          `specs not landed: change bound to \`${binding.branch}\` but no changes under \`llmanspec/specs/\` on its bound branch. Edit live specs there and commit (or set \`needs_specs_change: false\` if this change has no live contract edits). Skill: llman-sdd-propose — do NOT re-run change start when already attached; apply only when \`llman-sdd show <id> --json\` reports readyToImplement=true (llman-sdd-apply).`,
        );
      }
    }
  }

  // pattern gate (v1 change-id path).
  if (config.change_id_pattern) {
    try {
      const re = new RegExp(config.change_id_pattern, 'u');
      if (!re.test(id)) {
        push(
          'ERROR',
          'change-id',
          `Change id '${id}' does not match change_id.pattern '${config.change_id_pattern}' (sdd-workflow r29; scope: active changes only, archive/legacy shapes are not back-checked).`,
        );
      }
    } catch {
      /* compile already validated at load; ignore */
    }
  }

  // stage gate (v1 --stage: artifact presence per gate).
  if (opts.stage !== undefined) {
    if (opts.stage === 'designed' && !hasDesign) {
      push('ERROR', 'design.md', `Stage forced to 'designed' but design.md is missing`);
    }
    if (opts.stage === 'planned') {
      if (!hasDesign)
        push('ERROR', 'design.md', `Stage forced to 'planned' but design.md is missing`);
      if (!hasTasks) push('ERROR', 'tasks.md', `Stage forced to 'planned' but tasks.md is missing`);
    }
    if (opts.stage === 'full' && !hasTasks) {
      push('ERROR', 'tasks.md', `Stage forced to 'full' but tasks.md is missing`);
    }
  }

  const effective =
    opts.strict === true
      ? issues.map((i) => (i.level === 'WARNING' ? { ...i, level: 'ERROR' as const } : i))
      : issues;
  return { id, valid: effective.every((i) => i.level !== 'ERROR'), issues: effective };
}

const ALLOWED_FIELDS = [
  'depends_on',
  'blocks',
  'branch',
  'base_branch',
  'base_sha',
  'needs_specs_change',
];
