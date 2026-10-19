/**
 * proposal.md frontmatter binding (change-lifecycle capability):
 * comment-preserving read/upsert of the git binding keys via the `yaml`
 * package's document model. Pure string-in/string-out.
 */
import { parseDocument } from 'yaml';

import type { GitLike } from '../git/spawnGit.ts';

export interface ChangeBinding {
  branch: string;
  baseBranch: string;
  baseSha: string;
}

/**
 * Single frontmatter splitter (r73): the block starts with `---\n` at offset 0
 * and closes at the first standalone `---` line (followed by `\n` or EOF).
 * Every read path (extractFrontmatter / readBinding / parseDeps /
 * needs_specs_change) and the write path share this one contract.
 */
function splitFrontmatter(proposal: string): { body: string; frontmatter: string | null } {
  if (!proposal.startsWith('---\n')) return { body: proposal, frontmatter: null };
  const rest = proposal.slice(4);
  let pos = 0;
  while (pos <= rest.length) {
    const nl = rest.indexOf('\n', pos);
    const lineEnd = nl === -1 ? rest.length : nl;
    if (rest.slice(pos, lineEnd) === '---') {
      return {
        frontmatter: pos === 0 ? '' : rest.slice(0, pos - 1),
        body: nl === -1 ? '' : rest.slice(nl + 1),
      };
    }
    if (nl === -1) return { body: proposal, frontmatter: null };
    pos = nl + 1;
  }
  return { body: proposal, frontmatter: null };
}

/** Frontmatter block content (between the delimiters), or null without a block. */
export function extractFrontmatter(proposal: string): string | null {
  return splitFrontmatter(proposal).frontmatter;
}

/**
 * r99: frontmatter `title` value ('' when absent/empty/non-string) — the
 * authoritative change title; freeze prefers it over the proposal H1.
 * Internal whitespace (incl. YAML folded newlines) collapses to single
 * spaces so the frozen card stays a single-line YAML scalar.
 */
export function readFrontmatterTitle(frontmatter: string | null): string {
  if (frontmatter === null) return '';
  const title = parseDocument(frontmatter).get('title');
  return typeof title === 'string' ? title.replaceAll(/\s+/gu, ' ').trim() : '';
}

/**
 * r73: `needs_specs_change` is read from the frontmatter block only — a
 * body line with the same text must not flip the verdict. Default true.
 */
export function readNeedsSpecsChange(frontmatter: string | null): boolean {
  const m = frontmatter?.match(/^needs_specs_change:\s*(true|false)\s*$/mu)?.[1];
  return m === undefined ? true : m === 'true';
}

/**
 * r119: live specs landed on the bound branch — per-line prefix match on
 * `diff --name-only <base_branch>...<branch>`. The prefix is the change's
 * instance-relative specs dir (`llmanspec/specs/` for the repo-root instance,
 * `packages/tui/llmanspec/specs/` for a sub-project one); a path like
 * `docs/llmanspec/specs/x` must not count as landed. Edits to ANOTHER
 * instance's specs never match this instance's prefix (strictly own-instance,
 * mirroring the r116 write constraint).
 */
/** r119: the repo-root instance's specs prefix — the default every caller
 * degrades to (single-root byte parity). One constant, five call sites. */
export const DEFAULT_SPECS_PREFIX = 'llmanspec/specs/';

export function specsLanded(
  git: GitLike,
  binding: ChangeBinding,
  specsPrefix = DEFAULT_SPECS_PREFIX,
): boolean {
  const touched =
    git.runOpt(['diff', '--name-only', `${binding.baseBranch}...${binding.branch}`]) ?? '';
  return touched.split('\n').some((line) => line.startsWith(specsPrefix));
}

export function readBinding(proposal: string): ChangeBinding | null {
  const { frontmatter } = splitFrontmatter(proposal);
  if (frontmatter === null) return null;
  const doc = parseDocument(frontmatter);
  const branch = doc.get('branch');
  const baseBranch = doc.get('base_branch');
  const baseSha = doc.get('base_sha');
  if (typeof branch !== 'string' || typeof baseBranch !== 'string' || typeof baseSha !== 'string') {
    return null;
  }
  return { branch, baseBranch, baseSha };
}

/** Upsert the three binding keys, preserving all comments and other keys. */
export function writeBinding(proposal: string, binding: ChangeBinding): string {
  const { body, frontmatter } = splitFrontmatter(proposal);
  if (frontmatter === null) {
    const fm = `---\nbranch: ${binding.branch}\nbase_branch: ${binding.baseBranch}\nbase_sha: ${binding.baseSha}\n---\n`;
    return `${fm}${proposal}`;
  }
  const doc = parseDocument(frontmatter);
  doc.set('branch', binding.branch);
  doc.set('base_branch', binding.baseBranch);
  doc.set('base_sha', binding.baseSha);
  return `---\n${String(doc).replace(/\n$/u, '')}\n---\n${body}`;
}
