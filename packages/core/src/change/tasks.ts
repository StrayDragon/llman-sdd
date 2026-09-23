/**
 * tasks.md checkbox parsing — single source of truth shared by change
 * collection (report/collect), change validation (validation/changeCheck),
 * the archive task gate (change/lifecycle) and the CLI archive gate.
 * v1 line shape: `^\s*-\s+\[( |x|X)\]`.
 */

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
