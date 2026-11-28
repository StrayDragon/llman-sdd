/**
 * Canonical Studio deep-link parse/format (studio-web nest path + focus).
 * Pure: no I/O, no wall clock. Query `kind`/`target` stay backward compatible.
 */

export const STUDIO_FOCUS_KINDS = ['forest', 'macro-edge', 'state', 'edge'] as const;
export type StudioFocusKind = (typeof STUDIO_FOCUS_KINDS)[number];

export interface StudioDeepLinkFocus {
  kind: StudioFocusKind;
  id: string;
}

export interface StudioDeepLink {
  kind: string;
  target: string;
  nest: string[];
  focus: StudioDeepLinkFocus | null;
}

const FOCUS_KIND_SET = new Set<string>(STUDIO_FOCUS_KINDS);

export function parseStudioFocusToken(raw: string | null | undefined): StudioDeepLinkFocus | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  const colon = text.indexOf(':');
  if (colon <= 0) return null;
  const kind = text.slice(0, colon);
  const id = text.slice(colon + 1);
  if (!FOCUS_KIND_SET.has(kind) || id === '') return null;
  return { kind: kind as StudioFocusKind, id };
}

export function formatStudioFocusToken(focus: StudioDeepLinkFocus): string {
  return `${focus.kind}:${focus.id}`;
}

export function parseStudioNestToken(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

export function formatStudioNestToken(nest: readonly string[]): string {
  return nest.filter((k) => k !== '').join(',');
}

function readParam(
  search: URLSearchParams,
  hashParams: URLSearchParams,
  key: string,
): string | null {
  const fromHash = hashParams.get(key);
  if (fromHash !== null && fromHash !== '') return fromHash;
  const fromQuery = search.get(key);
  return fromQuery !== null && fromQuery !== '' ? fromQuery : null;
}

/** Parse query + optional `#hash` (hash wins for nest/focus/kind/target). */
export function parseStudioDeepLink(
  search: string | URLSearchParams,
  hash?: string,
): StudioDeepLink {
  const query =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const hashText = (hash ?? '').replace(/^#/u, '');
  const hashParams = new URLSearchParams(hashText.includes('=') ? hashText : '');
  const kind = readParam(query, hashParams, 'kind') ?? 'macro';
  const target = readParam(query, hashParams, 'target') ?? 'default';
  const tab = readParam(query, hashParams, 'tab');
  let resolvedKind = kind;
  let resolvedTarget = target;
  if (tab !== null && tab.startsWith('m:')) {
    resolvedKind = 'machine';
    resolvedTarget = tab.slice(2);
  } else if (tab !== null && tab.startsWith('doc:')) {
    resolvedKind = 'doc';
    resolvedTarget = tab.slice(4);
  } else if (tab === 'default') {
    resolvedKind = 'macro';
    resolvedTarget = 'default';
  }
  const nest = parseStudioNestToken(readParam(query, hashParams, 'nest'));
  const focus = parseStudioFocusToken(readParam(query, hashParams, 'focus'));
  return { kind: resolvedKind, target: resolvedTarget, nest, focus };
}

export function formatStudioDeepLinkQuery(link: StudioDeepLink): string {
  const params = new URLSearchParams();
  const nest = formatStudioNestToken(link.nest);
  const isDefaultMacro = link.kind === 'macro' && (link.target === 'default' || link.target === '');
  if (!isDefaultMacro || nest !== '' || link.focus !== null) {
    if (link.kind !== '') params.set('kind', link.kind);
    if (link.target !== '') params.set('target', link.target);
  }
  if (nest !== '') params.set('nest', nest);
  if (link.focus) params.set('focus', formatStudioFocusToken(link.focus));
  return params.toString();
}

export function nestStackFromPath(nest: readonly string[]): string[] {
  return nest.length <= 1 ? [] : nest.slice(1);
}

export function nestPathFromStack(tabRootKey: string, nestedKeys: readonly string[]): string[] {
  if (tabRootKey === '') return [...nestedKeys];
  return [tabRootKey, ...nestedKeys.filter((k) => k !== '')];
}

export function nestLevelLabel(nestStackLength: number): string {
  return `L${String(nestStackLength + 1)}`;
}
