import { CHANGES_DIR } from '../../change/lifecycle.ts';
import type { GraphFsIo, GraphNode, ScopeKind } from './types.ts';

function extractArchivedId(name: string): string | null {
  const m = name.match(/^\d{4}-\d{2}-\d{2}-(.+)$/u);
  return m ? (m[1] ?? null) : null;
}

/** Active nodes: dirs (recursively, depth-limited) with a proposal.md (r58). */
export function collectActiveNodes(
  io: GraphFsIo,
  root: string,
  maxScanDepth?: number,
): GraphNode[] {
  const out: GraphNode[] = [];
  const changesDir = `${root}/${CHANGES_DIR}`;
  if (!io.exists(changesDir) || !io.isDirectory(changesDir)) return out;
  const maxDepth = maxScanDepth ?? 8;
  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const name of io.listDir(dir).toSorted()) {
      if (name === 'archive' || name.startsWith('.')) continue;
      const child = `${dir}/${name}`;
      if (!io.isDirectory(child)) continue;
      if (io.exists(`${child}/proposal.md`)) {
        out.push({ id: name, archived: false, present: true });
      } else if (depth < maxDepth) {
        visit(child, depth + 1);
      }
    }
  };
  visit(changesDir, 1);
  return out;
}

export function collectArchivedNodes(io: GraphFsIo, root: string): GraphNode[] {
  const archiveDir = `${root}/${CHANGES_DIR}/archive`;
  if (!io.exists(archiveDir) || !io.isDirectory(archiveDir)) return [];
  const out: GraphNode[] = [];
  const seen = new Set<string>();
  for (const name of io.listDir(archiveDir)) {
    const child = `${archiveDir}/${name}`;
    if (!io.isDirectory(child)) continue;
    const id = extractArchivedId(name);
    if (id !== null && !seen.has(id)) {
      seen.add(id);
      out.push({ id, archived: true, present: true });
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
      const id = extractArchivedId(name);
      if (id !== node.id) continue;
      const date = name.slice(0, 10);
      if (best === '' || date > bestDate) {
        best = name;
        bestDate = date;
      }
    }
    const p = `${archiveDir}/${best}/proposal.md`;
    return io.exists(p) ? io.readText(p) : '';
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
