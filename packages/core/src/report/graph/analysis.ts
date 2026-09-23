import { parseDeps } from './deps.ts';
import { collectActiveNodes, collectArchivedNodes, collectNodes, proposalFor } from './nodes.ts';
import {
  GraphError,
  type DepEdge,
  type GraphFsIo,
  type GraphNode,
  type ScopeKind,
} from './types.ts';

interface RelationMaps {
  depends: Map<string, string[]>;
  reverse: Map<string, string[]>;
  nodeSet: Set<string>;
}

function buildMaps(io: GraphFsIo, root: string, nodes: GraphNode[]): RelationMaps {
  const depends = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  const nodeSet = new Set<string>();
  for (const node of nodes) {
    nodeSet.add(node.id);
    if (!node.present) continue;
    for (const dep of parseDeps(proposalFor(io, root, node))) {
      depends.set(node.id, [...(depends.get(node.id) ?? []), dep]);
      reverse.set(dep, [...(reverse.get(dep) ?? []), node.id]);
    }
  }
  return { depends, reverse, nodeSet };
}

export function buildDefaultNodes(io: GraphFsIo, root: string, kinds: ScopeKind[]): GraphNode[] {
  const nodes = collectNodes(io, root, kinds);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const all = collectNodes(io, root, ['active', 'archived']);
  const allMap = new Map(all.map((n) => [n.id, n]));

  const missing: string[] = [];
  for (const node of all) {
    if (!nodeIds.has(node.id) || !node.present) continue;
    for (const dep of parseDeps(proposalFor(io, root, node))) {
      if (!nodeIds.has(dep)) missing.push(dep);
    }
  }
  const seenMissing = new Set<string>();
  for (const dep of missing) {
    if (seenMissing.has(dep)) continue;
    seenMissing.add(dep);
    const existing = allMap.get(dep);
    if (existing !== undefined) nodes.push(existing);
    else nodes.push({ id: dep, archived: false, present: false });
  }
  return nodes;
}

export function collectEdges(io: GraphFsIo, root: string, nodes: GraphNode[]): DepEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: DepEdge[] = [];
  for (const node of nodes) {
    if (!node.present) continue;
    for (const dep of parseDeps(proposalFor(io, root, node))) {
      if (nodeIds.has(dep)) edges.push({ from: node.id, to: dep });
    }
  }
  return edges;
}

export function connectedComponents(nodeIds: string[], edges: DepEdge[]): string[][] {
  if (nodeIds.length === 0) return [];
  const parent = new Map<string, string>(nodeIds.map((id) => [id, id]));
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const edge of edges) union(edge.from, edge.to);
  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()].toSorted((a, b) => b.length - a.length);
}

/** Seed neighborhood: bidirectional BFS (depends_on + reverse) over both sets. */
export function buildSeedNeighborhood(
  io: GraphFsIo,
  root: string,
  seedId: string,
  maxDepth: number,
): GraphNode[] {
  const resolved = resolveSeedId(io, root, seedId);
  const allNodes = collectNodes(io, root, ['active', 'archived']);
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  if (!nodeMap.has(resolved)) {
    const prefix = resolved.split('-')[0] ?? '';
    const suggestions = [...nodeMap.keys()].filter((k) => k.startsWith(prefix));
    const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
    throw new GraphError(`change '${seedId}' not found.${hint}`);
  }
  const maps = buildMaps(io, root, allNodes);
  const visited = new Set<string>([resolved]);
  const queue: [string, number][] = [[resolved, 0]];
  while (queue.length > 0) {
    const [current, depth] = queue.shift() as [string, number];
    if (depth >= maxDepth) continue;
    const neighbors = [...(maps.depends.get(current) ?? []), ...(maps.reverse.get(current) ?? [])];
    for (const neighbor of neighbors) {
      if (maps.nodeSet.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, depth + 1]);
      }
    }
  }
  const result = [...visited]
    .filter((id) => nodeMap.has(id))
    .map((id) => nodeMap.get(id) as GraphNode);
  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

function resolveSeedId(io: GraphFsIo, root: string, seedId: string): string {
  const active = collectActiveNodes(io, root);
  const archived = collectArchivedNodes(io, root);
  const all = [...active.map((n) => n.id), ...archived.map((n) => n.id)];
  if (all.includes(seedId)) return seedId;
  const viaPrefix = all.filter((id) => id.startsWith(seedId));
  if (viaPrefix.length === 1) return viaPrefix[0] ?? seedId;
  const viaArchivedPrefix = archived.map((n) => n.id).filter((id) => id.startsWith(seedId));
  if (viaArchivedPrefix.length === 1) return viaArchivedPrefix[0] ?? seedId;
  return seedId;
}
