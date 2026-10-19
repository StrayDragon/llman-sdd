/**
 * r120 freeze content filter: git-style layered .gitignore evaluation for
 * `archive freeze` (review-freeze capability). For each candidate directory
 * the packer walks the tree and keeps only files no ignore layer decides
 * against: user-supplied `--ignore-file` layers first (highest precedence),
 * then `.gitignore` files found while descending (deeper wins), then the
 * ancestor chain from the candidate dir up to the discovered project root
 * (nearest ancestor holding `.git`; the instance root when absent).
 *
 * Purity: filesystem access flows through the injected IgnoreChainIo; the
 * `ignore` package is a pure pattern engine. All paths are absolute here;
 * POSIX relativization happens per layer (anchoring base = the layer's own
 * directory, exactly like git).
 */
import { dirname, join, relative, sep } from 'node:path';

import * as ignoreModule from 'ignore';

import type { FsPort } from '../util/fsPort.ts';

type Ignore = ignoreModule.Ignore;

/**
 * CJS `export =` interop: both Bun and Node surface the factory on
 * `.default` while the ESM namespace itself is not callable — and under
 * verbatimModuleSyntax tsc types the namespace import as a pure namespace,
 * so the callable is recovered through a structural cast against the
 * package's own `Ignore` interface.
 */
const createIgnore = (ignoreModule as unknown as { default: () => Ignore }).default;

export type IgnoreChainIo = Pick<FsPort, 'exists' | 'listDir' | 'readText' | 'isDirectory'>;

export class IgnoreChainError extends Error {}

/** One `.gitignore`-style rule set; `base` is the anchoring directory. */
interface Layer {
  base: string;
  ig: Ignore;
}

export interface FilteredCandidate {
  /** POSIX file paths relative to the candidate dir (7z entry base). */
  files: string[];
  /** Files excluded by ignore rules (pruned directories count recursively). */
  excluded: number;
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/');
}

function relPosix(from: string, to: string): string {
  return toPosix(relative(from, to));
}

/**
 * Outermost ignore root: the nearest ancestor of `start` (inclusive) holding
 * `.git` (a directory, or the file git uses for worktrees); when the tree is
 * not inside a git repository the instance root `start` itself is the
 * outermost layer (r120 fallback semantics).
 */
export function discoverIgnoreRoot(io: IgnoreChainIo, start: string): string {
  let cur = start;
  for (;;) {
    if (io.exists(join(cur, '.git'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return start;
    cur = parent;
  }
}

function loadLayer(io: IgnoreChainIo, base: string): Layer | null {
  const path = join(base, '.gitignore');
  if (!io.exists(path)) return null;
  return { base, ig: createIgnore().add(io.readText(path)) };
}

/** First decisive layer wins: user files → deepest walk layer → ancestors. */
function decide(
  user: readonly Layer[],
  walk: readonly Layer[],
  ancestors: readonly Layer[],
  pathAbs: string,
  isDir: boolean,
): boolean {
  const layers: Layer[] = [...user];
  for (let i = walk.length - 1; i >= 0; i--) layers.push(walk[i]!);
  layers.push(...ancestors);
  for (const layer of layers) {
    let rel = relPosix(layer.base, pathAbs);
    // A .gitignore governs only its own subtree (git semantics); layers the
    // path lies outside of cannot decide and must not be consulted.
    if (rel === '' || rel === '..' || rel.startsWith('../')) continue;
    if (isDir) rel = `${rel}/`;
    const verdict = layer.ig.test(rel);
    if (verdict.ignored || verdict.unignored) return verdict.ignored;
  }
  return false;
}

function countFiles(io: IgnoreChainIo, dirAbs: string): number {
  let n = 0;
  for (const name of io.listDir(dirAbs)) {
    if (name === '.git') continue;
    const abs = join(dirAbs, name);
    n += io.isDirectory(abs) ? countFiles(io, abs) : 1;
  }
  return n;
}

export interface CollectFilteredOpts {
  /** Instance root (absolute) — ignore-root discovery starts here. */
  rootAbs: string;
  /** Candidate change directory (absolute, under the instance root). */
  candidateAbs: string;
  /** Absolute paths of extra gitignore-format files (highest precedence,
   * anchored at the candidate dir — extras describe per-change junk). */
  userIgnoreFiles: string[];
}

export function collectFilteredEntries(
  io: IgnoreChainIo,
  opts: CollectFilteredOpts,
): FilteredCandidate {
  const user: Layer[] = [];
  for (const file of opts.userIgnoreFiles) {
    if (!io.exists(file)) {
      throw new IgnoreChainError(`ignore file not found: ${file}`);
    }
    user.push({ base: opts.candidateAbs, ig: createIgnore().add(io.readText(file)) });
  }

  // Ancestor chain: candidate dir first (highest of the fixed layers), then
  // each parent up to the discovered ignore root (outermost, last).
  const outer = discoverIgnoreRoot(io, opts.rootAbs);
  const ancestors: Layer[] = [];
  for (let cur = opts.candidateAbs; ; cur = dirname(cur)) {
    const layer = loadLayer(io, cur);
    if (layer) ancestors.push(layer);
    if (cur === outer) break;
    const parent = dirname(cur);
    if (parent === cur) break; // defensive: ignore root not an ancestor
  }

  const walk: Layer[] = [];
  const files: string[] = [];
  let excluded = 0;
  const visit = (dirAbs: string): void => {
    const layer = loadLayer(io, dirAbs);
    if (layer) walk.push(layer);
    for (const name of io.listDir(dirAbs).toSorted()) {
      if (name === '.git') continue; // git never packs .git metadata (r120)
      const abs = join(dirAbs, name);
      const isDir = io.isDirectory(abs);
      if (decide(user, walk, ancestors, abs, isDir)) {
        excluded += isDir ? countFiles(io, abs) : 1;
        continue;
      }
      if (isDir) visit(abs);
      else files.push(relPosix(opts.candidateAbs, abs));
    }
    if (layer) walk.pop();
  };
  visit(opts.candidateAbs);
  return { files, excluded };
}
