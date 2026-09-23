/**
 * proposal.md frontmatter binding (change-lifecycle capability):
 * comment-preserving read/upsert of the git binding keys via the `yaml`
 * package's document model. Pure string-in/string-out.
 */
import { parseDocument } from 'yaml';

export interface ChangeBinding {
  branch: string;
  baseBranch: string;
  baseSha: string;
}

function splitFrontmatter(proposal: string): { body: string; frontmatter: string | null } {
  if (!proposal.startsWith('---\n')) return { body: proposal, frontmatter: null };
  const end = proposal.indexOf('\n---\n', 4);
  if (end === -1) return { body: proposal, frontmatter: null };
  return {
    frontmatter: proposal.slice(4, end + 1),
    body: proposal.slice(end + 5),
  };
}

/**
 * SSOT for read-side frontmatter block extraction: content between the
 * opening `---\n` and the first following `\n---`, or null when no block is
 * present. Byte-equivalent to the inline `/^---\n([\s\S]*?)\n---/u` regex it
 * replaced at every read-side consume point (parseDeps, show needsSpecsChange,
 * changeCheck depends_on/blocks gates). `splitFrontmatter` above keeps the
 * write-side contract (close must be a standalone `\n---\n` line) so
 * writeBinding output stays byte-stable.
 */
export function extractFrontmatter(proposal: string): string | null {
  if (!proposal.startsWith('---\n')) return null;
  const end = proposal.indexOf('\n---', 4);
  if (end === -1) return null;
  return proposal.slice(4, end);
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
