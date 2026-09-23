import { type ChangeSummary, statusFor } from '../change/collect.ts';
/**
 * Change list rendering (peripheral-commands capability, r20): presentation
 * only — domain scan/stage derivation lives in change/collect.ts; this module
 * renders what it produces. Pure — no IO.
 */
import { renderMachine } from '../render/machine.ts';

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
