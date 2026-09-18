/**
 * Archive freeze/thaw orchestration (review-freeze capability, r24/r25).
 * Port of v1 change/freeze.rs: candidates = dated archive dirs; freeze adds
 * them into `freezed_changes.7z.archived` (7z a updates existing archives)
 * then removes the originals; thaw extracts selected dirs back into place.
 * All filesystem effects flow through the injected FreezeIo.
 */
import { join } from 'node:path';

import type { SevenZipPort } from './sevenzip.ts';

export const FREEZE_ARCHIVE_NAME = 'freezed_changes.7z.archived';
export const ARCHIVE_DIR_REL = 'llmanspec/changes/archive';

export interface FreezeIo {
  exists(path: string): boolean;
  listDir(path: string): string[];
  /** rm -rf */
  removeDir(path: string): void;
  mkdirp(path: string): void;
  /** Move a directory within the repo (same-device; adapter may copy). */
  moveDir(from: string, to: string): void;
}

const DATED_RE = /^\d{4}-\d{2}-\d{2}-/u;

export function freezeCandidates(
  io: FreezeIo,
  archiveDir: string,
  opts: { before?: string; keepRecent?: number },
): string[] {
  const all = io.exists(archiveDir)
    ? io
        .listDir(archiveDir)
        .filter((n) => DATED_RE.test(n))
        .toSorted()
    : [];
  let candidates = opts.before ? all.filter((n) => n.slice(0, 10) < (opts.before ?? '')) : [...all];
  const keep = opts.keepRecent ?? 0;
  if (keep > 0) candidates = candidates.slice(0, Math.max(0, candidates.length - keep));
  return candidates;
}

export interface FreezeOpts {
  before?: string;
  keepRecent?: number;
  dryRun?: boolean;
}

export interface FreezeRunResult {
  lines: string[];
  candidates: string[];
}

export async function runFreeze(
  io: FreezeIo,
  sz: SevenZipPort,
  rootAbs: string,
  opts: FreezeOpts,
): Promise<FreezeRunResult> {
  const candidates = freezeCandidates(io, ARCHIVE_DIR_REL, opts);
  if (candidates.length === 0) {
    return { candidates, lines: ['No archived changes selected for freezing.'] };
  }
  if (opts.dryRun) {
    return {
      candidates,
      lines: [
        `Dry run: freeze target ./${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME}`,
        `Would freeze ${candidates.length} archived changes:`,
        ...candidates.map((c) => `  - ${c}`),
      ],
    };
  }
  const archiveAbs = join(rootAbs, ARCHIVE_DIR_REL, FREEZE_ARCHIVE_NAME);
  await sz.add(archiveAbs, join(rootAbs, ARCHIVE_DIR_REL), candidates);
  for (const c of candidates) {
    io.removeDir(`${ARCHIVE_DIR_REL}/${c}`);
  }
  return {
    candidates,
    lines: [
      `Froze ${candidates.length} archived changes into ./${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME}`,
    ],
  };
}

export async function runList(io: FreezeIo, sz: SevenZipPort, rootAbs: string): Promise<string[]> {
  const archiveAbs = join(rootAbs, ARCHIVE_DIR_REL, FREEZE_ARCHIVE_NAME);
  if (!io.exists(archiveAbs)) {
    return [`No freeze archive found at ./${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME}`];
  }
  // Real 7z lists file paths under their directory (`<dir>/proposal.md`);
  // directory entries themselves are skipped by parseListNames. Derive the
  // archived change names from the leading path segment.
  const entries = (await sz.listEntries(archiveAbs)).map((n) => n.replace(/\/$/u, ''));
  const top = (n: string): string => n.split('/')[0] ?? n;
  const unique = [...new Set(entries.map(top).filter((n) => DATED_RE.test(n)))].toSorted();
  if (unique.length === 0) {
    return [
      `Freeze archive ${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME} contains no archived changes`,
    ];
  }
  return [
    `Frozen archived changes in ${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME} (${unique.length}):`,
    ...unique.map((c) => `  - ${c}`),
  ];
}

export interface ThawResult {
  lines: string[];
  restored: string[];
}

export async function runThaw(
  io: FreezeIo,
  sz: SevenZipPort,
  rootAbs: string,
  names: string[],
): Promise<ThawResult> {
  const archiveAbs = join(rootAbs, ARCHIVE_DIR_REL, FREEZE_ARCHIVE_NAME);
  if (!io.exists(`${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME}`)) {
    throw new Error(`No freeze archive found at ./${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME}`);
  }
  const tmpRel = 'llmanspec/.thaw-tmp';
  const tmpAbs = join(rootAbs, tmpRel);
  io.removeDir(tmpRel);
  try {
    await sz.extractAll(archiveAbs, tmpAbs);
    const available = new Set(io.listDir(tmpRel).filter((n) => DATED_RE.test(n)));
    const missing = names.filter((n) => !available.has(n));
    if (missing.length > 0) {
      throw new Error(
        `archived change(s) not found in freeze archive: ${missing.join(', ')} — available: ${[...available].toSorted().join(', ')}`,
      );
    }
    const restored: string[] = [];
    for (const name of names.toSorted()) {
      if (io.exists(`${ARCHIVE_DIR_REL}/${name}`)) {
        throw new Error(`target already exists: ${name}`);
      }
      io.moveDir(`${tmpRel}/${name}`, `${ARCHIVE_DIR_REL}/${name}`);
      restored.push(name);
    }
    return {
      restored,
      lines: [`Thawed ${restored.length} selected archived changes to ${ARCHIVE_DIR_REL}`],
    };
  } finally {
    io.removeDir(tmpRel);
  }
}
