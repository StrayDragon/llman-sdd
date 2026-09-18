/**
 * Whole-tree change-id number harvest (r35, v1 `change next-id` parity).
 * Read-only: walks directory names at any depth under `llmanspec/` and
 * extracts `c<digits>` tokens at token boundaries — the same value
 * `change new --from` used to inject as `llman_sdd_unique_id`.
 */

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

export function harvestUniqueNumbers(io: NextIdIo, root: string): IdHarvest {
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
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : null;
  return { maxNumber, nextNumber: maxNumber === null ? 1 : maxNumber + 1, warnings };
}
