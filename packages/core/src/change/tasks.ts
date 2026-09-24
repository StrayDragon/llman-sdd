/**
 * tasks.md checkbox parsing — single source of truth shared by change
 * collection (change/collect), change validation (validation/changeCheck),
 * the archive task gate (change/lifecycle) and the CLI archive gate.
 * v1 line shape: `^\s*-\s+\[( |x|X)\]`.
 *
 * D9 close-out pseudo-task detection (B23): tasks.md must list implementation
 * and verification tasks only — `change finalize`/`change archive` are
 * pipeline steps and MUST NOT be tasks (their task gate requires every task
 * checked, so a close-out "task" is self-contradictory: checking it lies,
 * leaving it blocks). The hint constant is the single shared text; validate
 * reports it as a WARNING and finalize/archive append it to the gate error
 * when a matching unchecked task exists.
 */

/** Regex: a task title whose verb (after the `T<n>[a-z]?:` numbering) starts
 * with a close-out step. Chinese verbs plus finalize/archive keywords. */
export const CLOSE_OUT_TASK_PATTERN = /^(收口|归档|finalize\b|archive\b)/iu;

/** The exact remediation hint — single definition (D9: 文案常量单一定义). */
export const CLOSE_OUT_TASK_HINT =
  'finalize is a pipeline step — remove it from tasks.md (finalize/archive require every task checked)';

/** Strip an optional `T<n>[a-z]?:` numbering prefix from a task title. */
export function stripTaskNumbering(title: string): string {
  return title.replace(/^T\d+[a-z]?:\s*/u, '');
}

/** True when the title (after numbering) starts with a close-out verb. */
export function isCloseOutTaskTitle(title: string): boolean {
  return CLOSE_OUT_TASK_PATTERN.test(stripTaskNumbering(title));
}

/** The unchecked pending lines in tasks.md that look like close-out steps. */
export function closeOutTaskLines(pendingLines: readonly string[]): string[] {
  return pendingLines.filter((line) => isCloseOutTaskTitle(line.replace(/^-\s+\[ \]\s*/u, '')));
}

export interface ParsedTaskCheckboxes {
  completed: number;
  total: number;
  /** Trimmed source lines of unchecked tasks, e.g. `- [ ] draft spec`. */
  pendingLines: string[];
}

export function parseTaskCheckboxes(tasksMd: string): ParsedTaskCheckboxes {
  let completed = 0;
  let total = 0;
  const pendingLines: string[] = [];
  for (const line of tasksMd.split('\n')) {
    const m = line.match(/^\s*-\s+\[( |x|X)\]/u);
    if (m) {
      total += 1;
      if (m[1] !== ' ') completed += 1;
      else pendingLines.push(line.trim());
    }
  }
  return { completed, total, pendingLines };
}
