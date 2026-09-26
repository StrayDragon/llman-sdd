/**
 * Frozen-change relationship-index card contract (review-freeze capability,
 * r24/r25): `freeze` replaces a dated archive dir with a flat card
 * `<YYYY-MM-DD>-<id>.yaml` whose content carries only the change's `title`
 * (proposal H1) and `depends_on` (proposal frontmatter) — a human/agent
 * readable navigation index. id and date are implied by the file name; bodies
 * live in the 7z cold backup. Cards are the authoritative record that a change
 * is in the cold backup.
 *
 * The card is a fenced YAML document (same `---` convention as proposal.md) so
 * existing frontmatter readers (`extractFrontmatter` / `parseDeps`) work
 * unchanged — parseDeps on a card text reads the preserved `depends_on`.
 *
 * Depends_on extraction is deliberately dependency-free (no `yaml` package):
 * it recognizes single-line flow `[a, b]`, block `- item` lists and multi-line
 * flow blocks, then normalizes to a single-line flow array so `parseDeps`
 * reads it unchanged. Anything unparseable degrades to `depends_on: []` (never
 * blocks the freeze).
 *
 * Pure string logic — all filesystem effects live in freeze.ts (FreezeIo).
 */

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

function escapeYamlScalar(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/** Normalize a flow-list inner string (comma-separated, quotes stripped). */
function splitFlowItems(inner: string): string[] {
  const out: string[] = [];
  for (const raw of inner.split(',')) {
    const item = raw.trim().replaceAll(/^['"]|['"]$/gu, '');
    if (item !== '') out.push(item);
  }
  return out;
}

function toFlow(items: string[]): string {
  return items.length === 0 ? 'depends_on: []' : `depends_on: [${items.join(', ')}]`;
}

/**
 * Extract `depends_on` from a proposal frontmatter block. Falls back to
 * `depends_on: []` when absent/empty/unparseable — a malformed dependency list
 * never breaks the freeze.
 */
export function extractDependsOn(frontmatter: string): string {
  const lines = frontmatter.split('\n');
  const flowIdx = lines.findIndex((l) => /^depends_on\s*:\s*\[/u.test(l));
  if (flowIdx !== -1) {
    // Single-line flow `depends_on: [a, b]` (may span lines).
    let acc = (lines[flowIdx] ?? '').replace(/^depends_on\s*:/u, '').trim();
    let j = flowIdx;
    while (!/\]\s*$/u.test(acc) && j < lines.length - 1) {
      j++;
      acc += ` ${(lines[j] ?? '').trim()}`;
    }
    const inner = acc.replace(/^\[/u, '').replace(/\]\s*/u, '');
    return toFlow(splitFlowItems(inner));
  }
  const blockIdx = lines.findIndex((l) => /^depends_on\s*:\s*$/u.test(l));
  if (blockIdx !== -1) {
    // Block list `- a` lines.
    const items: string[] = [];
    for (const l of lines.slice(blockIdx + 1)) {
      const m = l.match(/^\s*-\s+(\S+)/u);
      if (m?.[1]) items.push(m[1].replaceAll(/['"]/gu, ''));
      // multi-line flow handled below
      else if (/^\s*\[/u.test(l)) break;
      else if (l.trim() !== '') break;
    }
    if (items.length > 0) return toFlow(items);
    // Multi-line flow `[\n a,\n b\n ]`.
    let acc = lines
      .slice(blockIdx + 1)
      .join(' ')
      .replace(/^[^[]*\[/u, '');
    acc = (acc.split(']')[0] ?? '').trim();
    if (acc !== '') return toFlow(splitFlowItems(acc));
    return 'depends_on: []';
  }
  return 'depends_on: []';
}

/** Compose a relationship-index card: `title` + `depends_on` inside fences. */
export function composeFrozenCard(title: string, frontmatter: string): string {
  const dependsOn = extractDependsOn(frontmatter);
  return ['---', `title: "${escapeYamlScalar(title)}"`, dependsOn, '---'].join('\n') + '\n';
}
