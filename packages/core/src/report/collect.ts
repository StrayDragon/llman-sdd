/**
 * Change collection + rendering (peripheral-commands capability, r20).
 * Port of v1 commands/list.rs shapes. Pure — IO injected.
 */
import { readBinding } from '../change/frontmatter.ts';
import { CHANGES_DIR } from '../change/lifecycle.ts';
import { renderMachine } from '../render/machine.ts';

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
  let completed = 0;
  let total = 0;
  for (const line of tasksMd.split('\n')) {
    const m = line.match(/^\s*-\s+\[( |x|X)\]/u);
    if (m) {
      total += 1;
      if (m[1] !== ' ') completed += 1;
    }
  }
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

export function statusHuman(c: ChangeSummary): string {
  const s = statusFor(c.totalTasks, c.completedTasks);
  if (s === 'no-tasks') return 'no tasks';
  if (s === 'complete') return 'complete';
  return `${c.completedTasks}/${c.totalTasks} tasks`;
}

export function relativeTime(from: Date, now: Date): string {
  const ms = now.getTime() - from.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

export function renderChangesList(changes: readonly ChangeSummary[], now: Date): string[] {
  const lines = ['Active changes:'];
  if (changes.length === 0) return lines;
  const nameWidth = Math.max(...changes.map((c) => c.name.length));
  for (const c of changes) {
    lines.push(
      `  ${pad(c.name, nameWidth)}  ${pad(c.stage, 10)}  ${pad(statusHuman(c), 12)}  ${relativeTime(
        c.lastModified,
        now,
      )}${statusFor(c.totalTasks, c.completedTasks) === 'no-tasks' ? ` (idle ${c.idleDays}d)` : ''}`,
    );
  }
  return lines;
}

export function renderChangesJson(
  changes: readonly ChangeSummary[],
  mode: 'json' | 'compact-json' | 'toon' = 'json',
): string {
  return renderMachine(
    {
      changes: changes.map((c) => ({
        name: c.name,
        path: c.path,
        stage: c.stage,
        completedTasks: c.completedTasks,
        totalTasks: c.totalTasks,
        lastModified: c.lastModified.toISOString(),
        idleDays: c.idleDays,
        status: statusFor(c.totalTasks, c.completedTasks),
      })),
    },
    mode,
  );
}
