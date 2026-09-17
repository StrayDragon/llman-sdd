/**
 * Index orchestration (context-index capability, r26): rebuild writes the
 * pageindex tree under a create-new lock; check compares the stored spec_hash
 * against a fresh one. All paths are ROOT-RELATIVE through the injected IO.
 */
import type { SpecEntry } from '../validation/validate.ts';
import { buildTreeIndex, computeSpecHash, type SerializedTreeIndex } from './tree.ts';

export const CONTEXT_DIR_REL = 'llmanspec/.context';
export const PAGEINDEX_DIR_REL = `${CONTEXT_DIR_REL}/pageindex`;
export const TREE_JSON_REL = `${PAGEINDEX_DIR_REL}/tree.json`;
export const REBUILD_LOCK_REL = `${PAGEINDEX_DIR_REL}/.rebuild.lock`;
const LOCK_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface IndexIo {
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, content: string): void;
  remove(path: string): void;
  isDirectory(path: string): boolean;
  listDir(path: string): string[];
  mkdirp(path: string): void;
  processAlive(pid: number): boolean;
}

export interface RebuildOpts {
  chatModel: string;
  buildTimestamp?: string;
}

export interface RebuildResult {
  lines: string[];
  specCount: number;
}

/** Parse the minimal TOML-ish lock (pid/started_at/...). */
export function parseLock(content: string): { pid: number; startedAt: string } | null {
  const pid = content.match(/^pid\s*=\s*(\d+)/mu)?.[1];
  const startedAt = content.match(/^started_at\s*=\s*"([^"]+)"/mu)?.[1];
  if (pid === undefined || startedAt === undefined) return null;
  return { pid: Number(pid), startedAt };
}

function acquireLock(io: IndexIo, lockPath: string): void {
  if (io.exists(lockPath)) {
    const parsed = parseLock(io.readText(lockPath));
    const stale =
      parsed === null ||
      Date.now() - Date.parse(parsed.startedAt) > LOCK_MAX_AGE_MS ||
      !io.processAlive(parsed.pid);
    if (!stale) throw new Error(`rebuild already in progress (lock: ${lockPath})`);
    io.remove(lockPath);
  }
  io.writeText(
    lockPath,
    `pid = ${process.pid}\nstarted_at = "${new Date().toISOString()}"\nchunks_total = 1\nchunks_done = 1\nprogress_pct = 100\n`,
  );
}

export function rebuildIndex(
  io: IndexIo,
  specsDir: string,
  entries: readonly SpecEntry[],
  opts: RebuildOpts,
): RebuildResult {
  const lockRel = REBUILD_LOCK_REL;
  acquireLock(io, lockRel);
  try {
    const specHash = computeSpecHash(specsDir, io);
    const tree = buildTreeIndex(entries, {
      specHash,
      buildTimestamp: opts.buildTimestamp ?? new Date().toISOString(),
      chatModel: opts.chatModel,
    });
    io.mkdirp(PAGEINDEX_DIR_REL);
    io.writeText(TREE_JSON_REL, `${JSON.stringify(tree, null, 2)}\n`);
    return {
      lines: [
        'Scanning specs for pageindex tree (no LLM)...',
        `Building tree from ${entries.length} specs...`,
        `pageindex tree index rebuilt (${entries.length} specs, chat_model=${opts.chatModel === '' ? '<unset>' : opts.chatModel})`,
      ],
      specCount: entries.length,
    };
  } finally {
    io.remove(lockRel);
  }
}

export interface FreshnessResult {
  fresh: boolean;
  lines: string[];
}

export function checkIndexFreshness(io: IndexIo, specsDir: string): FreshnessResult {
  if (!io.exists(TREE_JSON_REL)) {
    return { fresh: false, lines: ['[pageindex] missing — run `index rebuild` first'] };
  }
  let tree: SerializedTreeIndex;
  try {
    tree = JSON.parse(io.readText(TREE_JSON_REL)) as SerializedTreeIndex;
  } catch {
    return { fresh: false, lines: ['[pageindex] stale (tree.json corrupted)'] };
  }
  const current = computeSpecHash(specsDir, io);
  const model = tree.chat_model === '' ? '<unset>' : tree.chat_model;
  if (tree.spec_hash === current) {
    return {
      fresh: true,
      lines: [
        `[pageindex] fresh (built ${tree.build_timestamp}, ${tree.docs.length} specs, chat model: ${model})`,
      ],
    };
  }
  return { fresh: false, lines: ['[pageindex] stale — specs changed since last rebuild'] };
}

/** Load the tree for retrieval (absent/corrupt → null). */
export function loadTree(io: IndexIo): SerializedTreeIndex | null {
  if (!io.exists(TREE_JSON_REL)) return null;
  try {
    return JSON.parse(io.readText(TREE_JSON_REL)) as SerializedTreeIndex;
  } catch {
    return null;
  }
}
