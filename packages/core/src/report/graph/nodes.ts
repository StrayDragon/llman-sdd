import { frozenCardIdOf, isFrozenCard } from '../../archive/frozenCard.ts';
import { walkActiveChangeDirs } from '../../change/collect.ts';
import { CHANGES_DIR } from '../../change/lifecycle.ts';
import { datedIdOf } from '../../util/datedId.ts';
import type { GraphFsIo, GraphNode, ScopeKind } from './types.ts';

function extractArchivedId(name: string): string | null {
  return datedIdOf(name);
}

/** Active nodes: dirs (recursively, depth-limited) with a proposal.md (r58). */
export function collectActiveNodes(
  io: GraphFsIo,
  root: string,
  maxScanDepth?: number,
): GraphNode[] {
  // T23: the active-change traversal is the shared walk (change/collect) —
  // graph nodes are just its (dir, name) pairs mapped to the node shape.
  const out: GraphNode[] = [];
  walkActiveChangeDirs(
    io,
    `${root}/${CHANGES_DIR}`,
    (_dir, name) => {
      out.push({ id: name, archived: false, present: true });
    },
    { maxScanDepth },
  );
  return out;
}

/**
 * Archived nodes: dated dirs (as before) plus flat frozen cards
 * `<YYYY-MM-DD>-<id>.yaml` (r54 extension — cards are archived changes whose
 * body lives in the cold backup; the card filename carries the id).
 */
export function collectArchivedNodes(io: GraphFsIo, root: string): GraphNode[] {
  const archiveDir = `${root}/${CHANGES_DIR}/archive`;
  if (!io.exists(archiveDir) || !io.isDirectory(archiveDir)) return [];
  const out: GraphNode[] = [];
  const seen = new Set<string>();
  for (const name of io.listDir(archiveDir)) {
    const child = `${archiveDir}/${name}`;
    if (io.isDirectory(child)) {
      const id = extractArchivedId(name);
      if (id !== null && !seen.has(id)) {
        seen.add(id);
        out.push({ id, archived: true, present: true });
      }
    } else if (isFrozenCard(name)) {
      const id = frozenCardIdOf(name);
      if (id !== null && !seen.has(id)) {
        seen.add(id);
        out.push({ id, archived: true, present: true });
      }
    }
  }
  return out;
}

export function collectNodes(
  io: GraphFsIo,
  root: string,
  kinds: ScopeKind[],
  maxScanDepth?: number,
): GraphNode[] {
  const combined: GraphNode[] = [];
  const seen = new Set<string>();
  for (const kind of kinds) {
    const nodes =
      kind === 'active'
        ? collectActiveNodes(io, root, maxScanDepth)
        : collectArchivedNodes(io, root);
    for (const node of nodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        combined.push(node);
      }
    }
  }
  return combined;
}

export function proposalFor(io: GraphFsIo, root: string, node: GraphNode): string {
  if (node.archived) {
    const archiveDir = `${root}/${CHANGES_DIR}/archive`;
    // latest matching strategy: pick the newest date-prefixed dir
    let best = '';
    let bestDate = '';
    for (const name of io.listDir(archiveDir)) {
      const id = isFrozenCard(name) ? frozenCardIdOf(name) : extractArchivedId(name);
      if (id !== node.id) continue;
      const date = name.slice(0, 10);
      if (best === '' || date > bestDate) {
        best = name;
        bestDate = date;
      }
    }
    const p = `${archiveDir}/${best}/proposal.md`;
    if (io.exists(p)) return io.readText(p);
    // Frozen card fallback (r54): dir gone, body in cold backup — read the
    // card (frontmatter incl. depends_on) so dependency edges survive freeze.
    const card = isFrozenCard(best) ? `${archiveDir}/${best}` : `${archiveDir}/${best}.yaml`;
    if (io.exists(card)) return io.readText(card);
    return '';
  }
  const changesDir = `${root}/${CHANGES_DIR}`;
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const name of io.listDir(dir).toSorted()) {
      if (name === 'archive' || name.startsWith('.')) continue;
      const child = `${dir}/${name}`;
      if (!io.isDirectory(child)) continue;
      if (io.exists(`${child}/proposal.md`)) {
        // leaf change dir — do not descend further
        if (name === node.id) found.push(`${child}/proposal.md`);
        continue;
      }
      visit(child);
    }
  };
  visit(changesDir);
  if (found.length === 0) return '';
  return io.readText(found[0] ?? '');
}
