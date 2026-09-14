/**
 * Change id derivation (change-lifecycle capability): legal ids are
 * verb-prefixed kebab-case ASCII, ≤60 chars (CLI-checked convention).
 */
const VERBS = [
  'bootstrap',
  'port',
  'add',
  'update',
  'remove',
  'refactor',
  'fix',
  'release',
  'migrate',
  'init',
  'draft',
  'archive',
] as const;

const ID_CAP = 60;

export function isLegalChangeId(id: string): boolean {
  return (
    VERBS.some((v) => id === v || id.startsWith(`${v}-`)) &&
    /^[a-z0-9-]+$/u.test(id) &&
    id.length <= ID_CAP
  );
}

export function deriveChangeId(description: string): string {
  let id = description
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, ID_CAP)
    .replaceAll(/-+$/gu, '');
  if (id === '') id = 'change';
  if (isLegalChangeId(id)) return id;
  return `add-${id}`.slice(0, ID_CAP).replaceAll(/-+$/gu, '');
}

export const DRAFT_PROPOSAL_TEMPLATE = `## Why

TODO: Why is this change needed?

## What Changes

TODO: Bullet list of what changes.
`;
