/**
 * Archive freeze/thaw orchestration (review-freeze capability, r24/r25).
 * Port of predecessor change/freeze.rs: candidates = dated archive dirs;
 * freeze now writes a flat card `<YYYY-MM-DD>-<id>.yaml` (frontmatter +
 * frozen metadata) into the archive dir, adds the body files into
 * `freezed_changes.7z.archived` (7z a updates existing archives), then removes
 * the original dirs; thaw extracts selected dirs back and removes the card.
 * All filesystem effects flow through the injected FreezeIo.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { extractFrontmatter } from '../change/frontmatter.ts';
import {
  FROZEN_CARD_EXT,
  composeFrozenCard,
  frozenCardIdOf,
  frozenCardName,
  isFrozenCard,
  parseFrozenCard,
  type FrozenFileEntry,
} from './frozenCard.ts';
import type { SevenZipPort } from './sevenzip.ts';

export const FREEZE_ARCHIVE_NAME = 'freezed_changes.7z.archived';
export const ARCHIVE_DIR_REL = 'llmanspec/changes/archive';

export interface FreezeIo {
  exists(path: string): boolean;
  listDir(path: string): string[];
  readText(path: string): string;
  writeText(path: string, content: string): void;
  isDirectory(path: string): boolean;
  /** Current wall clock (core stays injection-pure — r3). */
  now(): Date;
  /** rm -rf */
  removeDir(path: string): void;
  /** Remove a single file. */
  remove(path: string): void;
  mkdirp(path: string): void;
  /** Move a directory within the repo (same-device; adapter may copy). */
  moveDir(from: string, to: string): void;
}

const DATED_RE = /^\d{4}-\d{2}-\d{2}-/u;

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * r24: freeze candidates = date-prefixed entries that are directories with a
 * proposal.md body (i.e. not yet frozen — frozen dirs have been replaced by
 * the flat `<date>-<id>.yaml` card, which is a file, not a dir).
 */
export function freezeCandidates(
  io: FreezeIo,
  archiveDir: string,
  opts: { before?: string; keepRecent?: number },
): string[] {
  const all = io.exists(archiveDir)
    ? io
        .listDir(archiveDir)
        .filter((n) => DATED_RE.test(n) && !isFrozenCard(n) && io.isDirectory(`${archiveDir}/${n}`))
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

/** Collect body files (excluding the frozen card itself) under a dir. */
function collectBodyFiles(io: FreezeIo, dirAbs: string, dirRel: string, out: string[]): void {
  for (const name of io.exists(dirAbs) ? io.listDir(dirAbs) : []) {
    const rel = `${dirRel}/${name}`;
    const abs = `${dirAbs}/${name}`;
    if (io.isDirectory(abs)) {
      collectBodyFiles(io, abs, rel, out);
    } else if (!isFrozenCard(name)) {
      out.push(rel);
    }
  }
}

/** sha256 map for every body file (path → digest). */
function bodyShas(io: FreezeIo, archiveDirRel: string): Record<string, string> {
  const files: string[] = [];
  for (const name of io.exists(archiveDirRel) ? io.listDir(archiveDirRel) : []) {
    if (DATED_RE.test(name) && !isFrozenCard(name)) {
      const dir = `${archiveDirRel}/${name}`;
      if (io.isDirectory(dir)) collectBodyFiles(io, dir, name, files);
    }
  }
  const out: Record<string, string> = {};
  for (const rel of files) {
    out[rel] = sha256Text(io.readText(`${archiveDirRel}/${rel}`));
  }
  return out;
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

  // Card = authoritative record that bodies are in the cold backup. Write
  // cards first; on `7z add` failure roll them back and keep the original dirs.
  const shas = bodyShas(io, ARCHIVE_DIR_REL);
  const archiveAbs = join(rootAbs, ARCHIVE_DIR_REL, FREEZE_ARCHIVE_NAME);
  const frozenAt = io.now().toISOString();

  const cards: Array<{ datedId: string; source: string }> = [];
  for (const c of candidates) {
    const proposalRel = `${ARCHIVE_DIR_REL}/${c}/proposal.md`;
    const frontmatter = io.exists(proposalRel)
      ? (extractFrontmatter(io.readText(proposalRel)) ?? '')
      : '';
    const files: FrozenFileEntry[] = Object.entries(shas)
      .filter(([rel]) => rel.startsWith(`${c}/`))
      .map(([rel, sha]) => ({
        path: rel.slice(c.length + 1),
        sha256: sha,
      }));
    cards.push({
      datedId: c,
      source: composeFrozenCard(frontmatter, {
        at: frozenAt,
        archive: FREEZE_ARCHIVE_NAME,
        files,
      }),
    });
  }

  for (const card of cards) {
    io.writeText(`${ARCHIVE_DIR_REL}/${frozenCardName(card.datedId)}`, card.source);
  }
  try {
    await sz.add(archiveAbs, join(rootAbs, ARCHIVE_DIR_REL), candidates);
  } catch (error) {
    for (const card of cards) io.remove(`${ARCHIVE_DIR_REL}/${frozenCardName(card.datedId)}`);
    throw error;
  }
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

/**
 * r24: `--list` enumerates frozen changes from the flat cards on disk (no 7z
 * parse needed). Legacy entries frozen without cards (predecessor format) are
 * derived from the 7z listing so old archives stay listable (r25 legacy compat).
 */
export async function runList(io: FreezeIo, sz: SevenZipPort, rootAbs: string): Promise<string[]> {
  let names = new Set<string>();
  const archiveDirRel = ARCHIVE_DIR_REL;
  if (io.exists(archiveDirRel)) {
    for (const name of io.listDir(archiveDirRel)) {
      if (isFrozenCard(name) && frozenCardIdOf(name) !== null) {
        names.add(name.slice(0, -FROZEN_CARD_EXT.length));
      }
    }
  }
  const archiveAbs = join(rootAbs, ARCHIVE_DIR_REL, FREEZE_ARCHIVE_NAME);
  if (io.exists(archiveAbs)) {
    // Legacy/unexpected entries present only inside the 7z (no card on disk).
    const entries = (await sz.listEntries(archiveAbs)).map((n) => n.replace(/\/$/u, ''));
    const top = (n: string): string => n.split('/')[0] ?? n;
    for (const e of entries.map(top).filter((n) => DATED_RE.test(n))) {
      if (!names.has(e)) names.add(e);
    }
  }
  const sorted = [...names].toSorted();
  if (sorted.length === 0) {
    return [
      `Freeze archive ${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME} contains no archived changes`,
    ];
  }
  return [
    `Frozen archived changes in ${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME} (${sorted.length}):`,
    ...sorted.map((c) => `  - ${c}`),
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
  opts: { dest?: string } = {},
): Promise<ThawResult> {
  // r56: restore target override (created on demand); default = changes/archive
  const destRel = opts.dest ?? ARCHIVE_DIR_REL;
  const archiveAbs = join(rootAbs, ARCHIVE_DIR_REL, FREEZE_ARCHIVE_NAME);
  if (!io.exists(`${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME}`)) {
    throw new Error(`freeze archive not found: ./${ARCHIVE_DIR_REL}/${FREEZE_ARCHIVE_NAME}`);
  }
  const tmpRel = 'llmanspec/.thaw-tmp';
  const tmpAbs = join(rootAbs, tmpRel);
  io.removeDir(tmpRel);
  try {
    await sz.extractAll(archiveAbs, tmpAbs);
    const available = new Set(
      io.exists(tmpRel) ? io.listDir(tmpRel).filter((n) => DATED_RE.test(n)) : [],
    );
    // Cards on disk also count as available (they are the authoritative record
    // that bodies are in the cold backup, even before any extraction listing).
    for (const name of io.exists(ARCHIVE_DIR_REL) ? io.listDir(ARCHIVE_DIR_REL) : []) {
      if (isFrozenCard(name) && frozenCardIdOf(name) !== null) {
        available.add(name.slice(0, -FROZEN_CARD_EXT.length));
      }
    }
    const missing = names.filter((n) => !available.has(n));
    if (missing.length > 0) {
      throw new Error(
        `archived change(s) not found in freeze archive: ${missing.join(', ')} — available: ${[...available].toSorted().join(', ')}`,
      );
    }
    const restored: string[] = [];
    for (const name of names.toSorted()) {
      if (io.exists(`${destRel}/${name}`)) {
        throw new Error(`target already exists: ${name}`);
      }
      // Card present → verify extracted body against recorded sha256, then
      // restore and remove the card (thaw returns to the directory form).
      const cardRel = `${ARCHIVE_DIR_REL}/${frozenCardName(name)}`;
      if (io.exists(cardRel)) {
        const card = parseFrozenCard(io.readText(cardRel));
        for (const f of card?.frozen?.files ?? []) {
          const bodyRel = `${tmpRel}/${name}/${f.path}`;
          if (!io.exists(bodyRel)) {
            throw new Error(`thaw verification failed: ${name}/${f.path} missing in cold backup`);
          }
          if (sha256Text(io.readText(bodyRel)) !== f.sha256) {
            throw new Error(`thaw verification failed: ${name}/${f.path} sha256 mismatch`);
          }
        }
      }
      io.moveDir(`${tmpRel}/${name}`, `${destRel}/${name}`);
      if (io.exists(cardRel)) io.remove(cardRel);
      restored.push(name);
    }
    return {
      restored,
      lines: [`Thawed ${restored.length} selected archived changes to ${destRel}`],
    };
  } finally {
    io.removeDir(tmpRel);
  }
}
