/**
 * Transparent HTTP GET Content Negotiation for Canonical Deep-Links `/p/:wsKey/*` (studio-web r145).
 * - Browser (`Accept: text/html` or `?format=html`): SPA HTML with embedded `#studio-focus-context`
 * - Machine / Agent (`?format=json` or `Accept: application/json`): structured JSON
 * - Non-browser default (`curl` / Agent `fetch` / `?format=markdown`): token-efficient Markdown + routing tip
 */
import type { SpecIndexItem, StudioFocusContext, WorkspaceItem } from '@llman-sdd/core';

export type NegotiatedFormat = 'html' | 'json' | 'markdown';

export function resolveNegotiatedFormat(
  acceptHeader: string | undefined,
  formatQuery: string | undefined,
): NegotiatedFormat {
  const explicit = (formatQuery ?? '').trim().toLowerCase();
  if (explicit === 'json') return 'json';
  if (explicit === 'html') return 'html';
  if (explicit === 'md' || explicit === 'markdown') return 'markdown';

  const accept = (acceptHeader ?? '').toLowerCase();
  if (accept.includes('text/html') || accept.includes('application/xhtml+xml')) {
    return 'html';
  }
  if (accept.includes('application/json')) {
    return 'json';
  }
  return 'markdown';
}

export function renderNegotiatedMarkdown(input: {
  workspace: WorkspaceItem;
  focus: StudioFocusContext;
  specs: readonly SpecIndexItem[];
  openCommentCount: number;
  baseUrl: string;
}): string {
  const { workspace, focus, specs, openCommentCount, baseUrl } = input;
  const lines = [
    `# llman-sdd Studio · ${workspace.repo} (${workspace.branch})`,
    '',
    `- Workspace: \`${workspace.wsKey}\` (${workspace.protected ? 'protected branch' : 'writable branch'})`,
    `- Focus: \`${focus.targetKind}:${focus.targetId}\` — ${focus.summary}`,
    ...(focus.nest && focus.nest.length > 0 ? [`- Nest: \`${focus.nest.join(' > ')}\``] : []),
    ...(focus.focus ? [`- Focus object: \`${focus.focus.kind}:${focus.focus.id}\``] : []),
    `- Specs: ${String(specs.length)} | Open comments: ${String(openCommentCount)}`,
    `- Canonical URL: ${focus.canonicalUrl}`,
    '',
    '## Specs Overview',
    '',
    ...specs.map(
      (s) =>
        `- **${s.id}** (\`${s.kind}\`, ${String(s.ruleCount)} rules, ${String(s.scenarioCount)} scenarios): ${s.summary}`,
    ),
    '',
    '---',
    `> Routing tip: append \`?format=json\` for structured JSON (${baseUrl}/p/${encodeURIComponent(workspace.wsKey)}?format=json), or \`?format=html\` for the interactive browser workbench.`,
    '',
  ];
  return lines.join('\n');
}
