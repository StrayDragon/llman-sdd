import { readBinding } from './frontmatter.ts';
/**
 * Change collection + stage derivation (change domain, peripheral-commands
 * capability r20/r34 shapes; v1 commands/list.rs port). Pure — IO injected.
 * Lives in change/ (not report/) so the domain never imports its renderers:
 * report/{show,specs}.ts and validation/changeCheck.ts consume this one-way.
 */
import { CHANGES_DIR } from './lifecycle.ts';
import { parseTaskCheckboxes } from './tasks.ts';

export interface ChangeFsIo {
  exists(path: string): boolean;
  readText(path: string): string;
  listDir(path: string): string[];
  isDirectory(path: string): boolean;
  mtimeMs(path: string): number;
}

export interface ChangeSummary {
  name: string;
  path: string;
  title: string;
  stage: 'draft' | 'designed' | 'planned' | 'full';
  hasBinding: boolean;
  completedTasks: number;
  totalTasks: number;
  lastModified: Date;
  idleDays: number;
}

export type ChangeStatus = 'no-tasks' | 'complete' | 'in-progress';

export function statusFor(total: number, completed: number): ChangeStatus {
  if (total === 0) return 'no-tasks';
  return completed >= total ? 'complete' : 'in-progress';
}

export function stageFor(
  hasDesign: boolean,
  hasTasks: boolean,
  hasBinding: boolean,
): ChangeSummary['stage'] {
  // Monotonic v1 parity (r34): design.md gates designed, tasks.md only
  // upgrades on top of design, binding only upgrades the complete set.
  if (hasDesign && hasTasks && hasBinding) return 'full';
  if (hasDesign && hasTasks) return 'planned';
  if (hasDesign) return 'designed';
  return 'draft';
}

export function countTasks(tasksMd: string): { completed: number; total: number } {
  const { completed, total } = parseTaskCheckboxes(tasksMd);
  return { completed, total };
}

export function firstH1(md: string): string {
  for (const line of md.split('\n')) {
    const m = line.match(/^#\s+(.*)$/u);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

export function collectChanges(
  io: ChangeFsIo,
  root: string,
  now: Date,
  opts: { maxScanDepth?: number } = {},
): ChangeSummary[] {
  const changesDir = `${root}/${CHANGES_DIR}`;
  if (!io.exists(changesDir) || !io.isDirectory(changesDir)) return [];
  const maxDepth = opts.maxScanDepth ?? 8;
  const out: ChangeSummary[] = [];
  // r58: recursive, depth-limited proposal discovery (v1 --max-scan-depth parity)
  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const name of io.listDir(dir).toSorted()) {
      if (name === 'archive' || name.startsWith('.')) continue;
      const child = `${dir}/${name}`;
      if (!io.isDirectory(child)) continue;
      if (io.exists(`${child}/proposal.md`)) {
        readChangeDir(child, name);
      } else {
        visit(child, depth + 1);
      }
    }
  };
  const readChangeDir = (dir: string, name: string): void => {
    const proposal = `${dir}/proposal.md`;
    const hasDesign = io.exists(`${dir}/design.md`);
    const hasTasks = io.exists(`${dir}/tasks.md`);
    const hasBinding = readBinding(io.readText(proposal)) !== null;
    const { completed, total } = hasTasks
      ? countTasks(io.readText(`${dir}/tasks.md`))
      : { completed: 0, total: 0 };

    // lastModified = newest mtime across the change dir
    let latest = io.mtimeMs(proposal);
    for (const f of [hasDesign ? `${dir}/design.md` : null, hasTasks ? `${dir}/tasks.md` : null]) {
      if (f) latest = Math.max(latest, io.mtimeMs(f));
    }
    const lastModified = new Date(latest);
    const idleDays = Math.floor((now.getTime() - lastModified.getTime()) / 86_400_000);

    out.push({
      name,
      path: name,
      title: firstH1(io.readText(proposal)),
      stage: stageFor(hasDesign, hasTasks, hasBinding),
      hasBinding,
      completedTasks: completed,
      totalTasks: total,
      lastModified,
      idleDays,
    });
  };
  visit(changesDir, 1);
  // v1 lists newest-first
  return out.toSorted((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}
