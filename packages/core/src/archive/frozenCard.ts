/**
 * Frozen-change thin-index card contract (review-freeze capability, r24/r25):
 * `freeze` replaces a dated archive dir with a flat card `<YYYY-MM-DD>-<id>.yaml`
 * whose content mirrors the archived proposal's frontmatter fence verbatim plus
 * a `frozen:` section (timestamp, body file list with per-file sha256, archive
 * name). Cards are the authoritative record that a change is in the cold backup.
 *
 * The card is a fenced YAML document (same `---` convention as proposal.md) so
 * existing frontmatter readers (`extractFrontmatter` / `parseDeps`) work
 * unchanged — parseDeps on a card text reads the preserved `depends_on`.
 *
 * Pure string logic — all filesystem effects live in freeze.ts (FreezeIo).
 */
import { parseDocument } from 'yaml';

export const FROZEN_CARD_EXT = '.yaml';

/** `2026-01-01-old` → `2026-01-01-old.yaml` */
export function frozenCardName(datedId: string): string {
  return `${datedId}${FROZEN_CARD_EXT}`;
}

/** id for a card filename (`2026-01-01-old.yaml` → `old`); null when not a card. */
export function frozenCardIdOf(name: string): string | null {
  const m = name.match(/^\d{4}-\d{2}-\d{2}-(.+)\.yaml$/u);
  return m?.[1] ?? null;
}

export function isFrozenCard(name: string): boolean {
  return frozenCardIdOf(name) !== null;
}

export interface FrozenFileEntry {
  path: string;
  sha256: string;
}

export interface FrozenMeta {
  at: string;
  archive: string;
  files: FrozenFileEntry[];
}

export interface ParseFrozenCardResult {
  /** raw frontmatter fence content (between the delimiters). */
  frontmatter: string;
  /** frozen metadata section; undefined when absent (malformed). */
  frozen?: FrozenMeta;
  /** the raw card text, for pass-through readers. */
  raw: string;
}

/** Compose a card document: original frontmatter + frozen section + close fence. */
export function composeFrozenCard(frontmatter: string, frozen: FrozenMeta): string {
  const fileLines = frozen.files.map((f) => `    "${escapeYamlScalar(f.path)}": ${f.sha256}`);
  const lines = [
    '---',
    ...frontmatter.replace(/\n+$/u, '').split('\n'),
    'frozen:',
    `  at: "${escapeYamlScalar(frozen.at)}"`,
    `  archive: "${escapeYamlScalar(frozen.archive)}"`,
    '  files:',
    ...fileLines,
    '---',
  ];
  return `${lines.join('\n')}\n`;
}

function escapeYamlScalar(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * Parse a frozen card back to id/frontmatter/frozen. Returns null when the text
 * is not a fenced card (missing `---` fence or id shape).
 */
export function parseFrozenCard(text: string): ParseFrozenCardResult | null {
  if (!text.startsWith('---\n')) return null;
  const close = text.indexOf('\n---', 4);
  if (close === -1) return null;
  const block = text.slice(4, close);
  const raw = text;
  // The id lives in the file name (`<YYYY-MM-DD>-<id>.yaml`), not in the body;
  // callers derive it via `frozenCardIdOf`. The card text itself round-trips
  // frontmatter and the frozen manifest.
  const doc = parseDocument(block);
  const map = doc.toJS() as Record<string, unknown> | null;
  if (map === null || typeof map !== 'object') return null;
  let frozen: FrozenMeta | undefined;
  const fz = map['frozen'];
  if (fz !== null && typeof fz === 'object') {
    const fzMap = fz as Record<string, unknown>;
    const filesRaw = fzMap['files'];
    const files: FrozenFileEntry[] = [];
    if (filesRaw !== null && typeof filesRaw === 'object') {
      for (const [path, sha] of Object.entries(filesRaw as Record<string, unknown>)) {
        if (typeof sha === 'string' && /^[0-9a-f]{64}$/u.test(sha))
          files.push({ path, sha256: sha });
      }
    }
    frozen = {
      at: typeof fzMap['at'] === 'string' ? fzMap['at'] : '',
      archive: typeof fzMap['archive'] === 'string' ? fzMap['archive'] : '',
      files,
    };
  }
  return {
    frontmatter: block,
    frozen,
    raw,
  };
}
