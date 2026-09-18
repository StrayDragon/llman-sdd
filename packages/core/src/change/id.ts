/**
 * Change id derivation (change-lifecycle capability): v1 `change/new.rs`
 * `derive_change_id` parity — pure kebab sanitization (lowercase alnum,
 * separators), no verb requirement, empty/oversized handling.
 */

const ID_CAP = 60;

export class ChangeIdError extends Error {}

export function isLegalChangeId(id: string): boolean {
  return /^[a-z0-9-]+$/u.test(id) && id.length > 0 && id.length <= ID_CAP;
}

/** v1 parity: sanitize to lowercase kebab (ASCII alnum only; CJK/punct dropped). */
export function deriveChangeId(description: string): string {
  const trimmed = description.trim();
  if (trimmed === '') {
    throw new ChangeIdError('--from <DESCRIPTION> must be non-empty');
  }
  let id = '';
  let prevDash = true;
  for (const ch of trimmed) {
    if (/[a-zA-Z0-9]/u.test(ch)) {
      id += ch.toLowerCase();
      prevDash = false;
    } else if (
      /\s/u.test(ch) ||
      ch === '_' ||
      ch === '.' ||
      ch === '-' ||
      ch === '/' ||
      ch === '\\'
    ) {
      if (!prevDash) {
        id += '-';
        prevDash = true;
      }
    } else {
      // Punctuation / CJK etc.: drop (CJK intentionally dropped to keep ids
      // ASCII-friendly); a dropped char at a word boundary yields a `-`.
      if (!prevDash) {
        id += '-';
        prevDash = true;
      }
    }
  }
  while (id.endsWith('-')) id = id.slice(0, -1);
  if (id === '') {
    throw new ChangeIdError(
      '--from <DESCRIPTION> yielded an empty id after sanitizing; provide a description with at least one alphanumeric character',
    );
  }
  if (id.length > ID_CAP) {
    const cutoff = id.slice(0, ID_CAP).lastIndexOf('-');
    const at = cutoff === -1 ? ID_CAP : cutoff;
    id = id.slice(0, at);
    while (id.endsWith('-')) id = id.slice(0, -1);
  }
  return id;
}

export const DRAFT_PROPOSAL_TEMPLATE = `## Why

TODO: Why is this change needed?

## What Changes

TODO: Bullet list of what changes.
`;
