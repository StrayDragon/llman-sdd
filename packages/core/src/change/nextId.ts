/**
 * Whole-tree change-id number harvest (r35, v1 `change next-id` parity).
 * Read-only: walks directory names at any depth under `llmanspec/` and
 * extracts `c<digits>` tokens at token boundaries — the same value
 * `change new --from` used to inject as `llman_sdd_unique_id`.
 * r35 extension: the scan covers the current tree plus every linked git
 * worktree's own `llmanspec/` tree (see harvestAcrossWorktrees).
 */

import { worktreeList, type GitLike } from '../git/spawnGit.ts';

export interface NextIdIo {
  listDir(path: string): string[];
  isDirectory(path: string): boolean;
}

export interface IdHarvest {
  maxNumber: number | null;
  nextNumber: number;
  warnings: string[];
}

const C_TOKEN_RE = /(?:^|[^a-z0-9])c([0-9]+)(?:$|[^a-z0-9])/iu;

/**
 * Extract the number carried by a change-id-shaped directory name: the first
 * `c<digits>` run at a token boundary (matches `c2790`, `c10-active`, and the
 * `2026-01-01-c20-slug` date-prefixed archive shape; glued names like `cab12`
 * match no position). Leading digits (`3-third`) do not count.
 */
export function extractUniqueNumber(name: string): number | null {
  const m = C_TOKEN_RE.exec(name);
  return m ? Number(m[1]) : null;
}

/** Numbers found under one tree root plus per-walk listing warnings. */
export function collectNumbers(
  io: NextIdIo,
  root: string,
): { numbers: number[]; warnings: string[] } {
  const numbers: number[] = [];
  const warnings: string[] = [];
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = io.listDir(dir);
    } catch (error) {
      warnings.push(`cannot list ${dir}: ${(error as Error).message}`);
      return;
    }
    for (const name of names.toSorted()) {
      if (name.startsWith('.')) continue;
      const full = `${dir}/${name}`;
      if (!io.isDirectory(full)) continue;
      const n = extractUniqueNumber(name);
      if (n !== null) numbers.push(n);
      walk(full);
    }
  };
  walk(root);
  return { numbers, warnings };
}

export function harvestUniqueNumbers(io: NextIdIo, root: string): IdHarvest {
  const { numbers, warnings } = collectNumbers(io, root);
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : null;
  return { maxNumber, nextNumber: maxNumber === null ? 1 : maxNumber + 1, warnings };
}

/**
 * r35 extension: harvest across the current tree AND every linked git
 * worktree's own `llmanspec/` tree (worktree paths deduped). Worktree listing
 * failure degrades to the current tree only (best-effort, same grade as the
 * archive sweep) with the cause recorded in warnings; the same number visible
 * in more than one worktree raises a warning naming it and the worktrees.
 */
export function harvestAcrossWorktrees(git: GitLike, io: NextIdIo, root: string): IdHarvest {
  const warnings: string[] = [];
  let paths: string[] | null;
  try {
    const seen = new Set<string>();
    paths = [];
    for (const entry of worktreeList(git)) {
      const path = entry.path.replace(/\/+$/u, '');
      if (!seen.has(path)) {
        seen.add(path);
        paths.push(path);
      }
    }
  } catch (error) {
    paths = null;
    warnings.push(
      `worktree list failed: ${(error as Error).message} — scanned the current tree only`,
    );
  }
  const trees = paths === null ? [root] : paths.map((p) => `${p}/llmanspec`);
  const perTree = trees.map((at) => ({ at, ...collectNumbers(io, at) }));
  for (const tree of perTree) warnings.push(...tree.warnings);
  const where = new Map<number, Set<string>>();
  for (const tree of perTree) {
    for (const n of new Set(tree.numbers)) {
      const labels = where.get(n) ?? new Set<string>();
      if (labels.size === 0) where.set(n, labels);
      labels.add(tree.at);
    }
  }
  for (const n of [...where.keys()].toSorted((a, b) => a - b)) {
    const labels = [...(where.get(n) as Set<string>)].toSorted();
    if (labels.length > 1) {
      warnings.push(`number ${n} appears in multiple worktrees: ${labels.join(', ')}`);
    }
  }
  const all = perTree.flatMap((tree) => tree.numbers);
  const maxNumber = all.length > 0 ? Math.max(...all) : null;
  return { maxNumber, nextNumber: maxNumber === null ? 1 : maxNumber + 1, warnings };
}
