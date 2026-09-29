/**
 * Instance-root discovery (subproject-llmanspec-discovery, r91-r92): the
 * unified-root axiom — every llman-sdd operation targets one llmanspec/
 * directory; the repo root is just the default instance and a workspace
 * subpackage carrying its own llmanspec/ is another instance of the same
 * shape. Pure: filesystem access only through the injected IO.
 */

export interface RootsIo {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  listDir(path: string): string[];
}

export interface RootEntry {
  /** Directory containing the llmanspec/ instance (the instance root). */
  rootDir: string;
  /** The llmanspec directory itself. */
  llmanspecDir: string;
}

/** Directory names never descended into during discovery. */
export const ROOT_EXCLUDED_DIRS: ReadonlySet<string> = new Set(['node_modules', 'target', '.git']);

const joinPath = (dir: string, name: string): string =>
  dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;

/**
 * A directory counts as an llmanspec root when it carries `config.yaml` or a
 * `specs/` subdir — bare `llmanspec/` scaffolds in flight are not instances.
 */
export function isValidRoot(llmanspecDir: string, io: RootsIo): boolean {
  if (!io.isDirectory(llmanspecDir)) return false;
  return io.exists(`${llmanspecDir}/config.yaml`) || io.isDirectory(`${llmanspecDir}/specs`);
}

/**
 * Discover instance roots under `startDir` (convention scan). The start dir
 * itself is checked first (depth 0 — the git-root instance), then subdirs
 * depth-first in stable sort order; `llmanspec/` contents are never descended
 * into and excluded names are pruned. `maxDepth` mirrors the global
 * --max-scan-depth knob (default 8).
 */
export function discoverRoots(
  startDir: string,
  io: RootsIo,
  opts: { maxDepth?: number } = {},
): RootEntry[] {
  const maxDepth = opts.maxDepth ?? 8;
  const roots: RootEntry[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    const llmanspecDir = joinPath(dir, 'llmanspec');
    if (isValidRoot(llmanspecDir, io)) roots.push({ rootDir: dir, llmanspecDir });
    let names: string[];
    try {
      names = io.listDir(dir);
    } catch {
      return;
    }
    for (const name of names.toSorted()) {
      if (name.startsWith('.') || ROOT_EXCLUDED_DIRS.has(name)) continue;
      const full = joinPath(dir, name);
      if (!io.isDirectory(full)) continue;
      if (name === 'llmanspec') continue;
      walk(full, depth + 1);
    }
  };
  walk(startDir, 0);
  return roots;
}

export interface ScopeCrossing {
  scope: string;
  rootDir: string;
}

/**
 * Single-ownership rule (r92): a file path belongs to exactly one llmanspec
 * root. Scope entries are resolved against the owning instance root; a scope
 * that reaches into another root's instance directory crosses the boundary
 * and is reported with the offending scope and the other root. Ancestor roots
 * are exempt: a sub-root scoping its own subtree always resolves under the
 * ancestor's directory, but ownership there belongs to the descendant.
 */
export function scopeCrossings(
  scopePaths: readonly string[],
  instanceRootDir: string,
  otherRoots: readonly RootEntry[],
): ScopeCrossing[] {
  const crossings: ScopeCrossing[] = [];
  for (const raw of scopePaths) {
    const scope = raw.trim().replace(/^\.\//u, '').replace(/\/+$/u, '');
    if (scope === '') continue;
    const abs = joinPath(instanceRootDir, scope);
    for (const other of otherRoots) {
      if (other.rootDir === instanceRootDir) continue;
      // Ancestor exemption: our own subtree necessarily sits inside the
      // ancestor's directory — the ancestor does not own it.
      if (instanceRootDir.startsWith(`${other.rootDir}/`)) continue;
      if (abs === other.rootDir || abs.startsWith(`${other.rootDir}/`)) {
        crossings.push({ scope: raw.trim(), rootDir: other.rootDir });
        break;
      }
    }
  }
  return crossings;
}

/**
 * Nearest instance root at or above `startDir` (inclusive) — the cwd
 * resolution behind "cd into the subpackage and run" (r94). Returns null when
 * no ancestor carries a valid llmanspec root.
 */
export function resolveInstanceRoot(startDir: string, io: RootsIo): string | null {
  let dir = startDir;
  for (;;) {
    if (isValidRoot(joinPath(dir, 'llmanspec'), io)) return dir;
    const parent = dir.replace(/\/+$/u, '').replace(/\/[^/]+$/u, '');
    if (parent === '' || parent === dir) return null;
    dir = parent;
  }
}
