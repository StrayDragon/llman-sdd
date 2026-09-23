/**
 * Change dependency graph (peripheral-commands capability, r21/r30/r54):
 * v1 `commands/graph.rs` observable contract — scope parsing, connected
 * component subgraphs, conditional classDef, empty placeholder, bidirectional
 * seed BFS, error paths. Pure: IO injected.
 */

import { CHANGES_DIR } from '../change/lifecycle.ts';

export interface GraphFsIo {
  exists(path: string): boolean;
  readText(path: string): string;
  listDir(path: string): string[];
  isDirectory(path: string): boolean;
}

interface GraphNode {
  id: string;
  archived: boolean;
  /** true = directory on disk; false = phantom (frozen/removed dependency). */
  present: boolean;
}

interface DepEdge {
  from: string;
  to: string;
}

export class GraphError extends Error {}

function extractArchivedId(name: string): string | null {
  const m = name.match(/^\d{4}-\d{2}-\d{2}-(.+)$/u);
  return m ? (m[1] ?? null) : null;
}

/** Extract depends_on entries (flow + block styles, r30). */
export function parseDeps(proposal: string): string[] {
  const fm = proposal.match(/^---\n([\s\S]*?)\n---/u);
  const deps: string[] = [];
  if (!fm?.[1]) return deps;
  let inDeps = false;
  for (const line of fm[1].split('\n')) {
    const flow = line.match(/^depends_on:\s*\[([^\]]*)\]\s*$/u);
    if (flow) {
      for (const item of flow[1]?.split(',') ?? []) {
        const dep = item.trim().replaceAll(/^['"]|['"]$/gu, '');
        if (dep !== '' && !/^[0-9]+$/u.test(dep)) deps.push(dep);
      }
      inDeps = false;
      continue;
    }
    if (/^depends_on:\s*$/u.test(line)) {
      inDeps = true;
      continue;
    }
    if (inDeps) {
      const m = line.match(/^\s*-\s+(\S+)/u);
      if (m?.[1] && !/^[0-9]+$/u.test(m[1])) deps.push(m[1]);
      else if (line.trim() !== '') inDeps = false;
    }
  }
  return deps;
}

type ScopeKind = 'active' | 'archived';

function parseScope(scope: string): ScopeKind[] {
  if (scope === 'all') return ['active', 'archived'];
  const kinds: ScopeKind[] = [];
  for (const part of scope.split(',')) {
    const t = part.trim();
    if (t === 'active') kinds.push('active');
    else if (t === 'archived') kinds.push('archived');
    else {
      throw new GraphError(
        `Unknown scope: '${t}'. Supported: active, archived, all (or comma-separated like active,archived)`,
      );
    }
  }
  if (kinds.length === 0) throw new GraphError('Scope cannot be empty');
  return kinds;
}

/** Active nodes: dirs (recursively) with a proposal.md (v1 discovery). */
function collectActiveNodes(io: GraphFsIo, root: string): GraphNode[] {
  const out: GraphNode[] = [];
  const changesDir = `${root}/${CHANGES_DIR}`;
  if (!io.exists(changesDir) || !io.isDirectory(changesDir)) return out;
  const visit = (dir: string): void => {
    for (const name of io.listDir(dir).toSorted()) {
      if (name === 'archive' || name.startsWith('.')) continue;
      const child = `${dir}/${name}`;
      if (!io.isDirectory(child)) continue;
      if (io.exists(`${child}/proposal.md`)) {
        out.push({ id: name, archived: false, present: true });
      } else {
        visit(child);
      }
    }
  };
  visit(changesDir);
  return out;
}

function collectArchivedNodes(io: GraphFsIo, root: string): GraphNode[] {
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

function collectNodes(io: GraphFsIo, root: string, kinds: ScopeKind[]): GraphNode[] {
  const combined: GraphNode[] = [];
  const seen = new Set<string>();
  for (const kind of kinds) {
    const nodes = kind === 'active' ? collectActiveNodes(io, root) : collectArchivedNodes(io, root);
    for (const node of nodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        combined.push(node);
      }
    }
  }
  return combined;
}

function proposalFor(io: GraphFsIo, root: string, node: GraphNode): string {
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

function buildDefaultNodes(io: GraphFsIo, root: string, kinds: ScopeKind[]): GraphNode[] {
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

function collectEdges(io: GraphFsIo, root: string, nodes: GraphNode[]): DepEdge[] {
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

function connectedComponents(nodeIds: string[], edges: DepEdge[]): string[][] {
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

function componentLabel(nodes: GraphNode[], ids: Set<string>): string {
  const comp = nodes.filter((n) => ids.has(n.id));
  const allActive = comp.every((n) => !n.archived && n.present);
  const allArchived = comp.every((n) => n.archived);
  if (allActive) return 'Active';
  if (allArchived) return 'Done';
  return 'Mixed';
}

const sanitize = (id: string): string => id.replaceAll('-', '_');

export interface GraphOptions {
  scope?: string;
  depth?: number;
  seed?: string;
}

export interface GraphNodeIr {
  id: string;
  archived: boolean;
  present: boolean;
}

export interface GraphEdgeIr {
  from: string;
  to: string;
}

export interface GraphDataIr {
  scope: string;
  nodes: GraphNodeIr[];
  edges: GraphEdgeIr[];
}

/** Structured graph IR (cli-output-cleanup): same traversal graphMermaid
 * renders, exposed for `graph --output json|toon`. Empty-node cases yield an
 * empty nodes array (the mermaid placeholder line is a render concern). */
export function graphData(io: GraphFsIo, root: string, opts: GraphOptions = {}): GraphDataIr {
  const scope = opts.scope ?? 'active';
  const kinds = parseScope(scope);

  let nodes: GraphNode[];
  if (opts.seed !== undefined) {
    nodes = buildSeedNeighborhood(io, root, opts.seed, opts.depth ?? 1);
  } else {
    nodes = buildDefaultNodes(io, root, kinds);
  }
  const irNodes: GraphNodeIr[] = nodes.map((n) => ({
    id: n.id,
    archived: n.archived,
    present: n.present,
  }));
  const irEdges: GraphEdgeIr[] =
    nodes.length === 0
      ? []
      : collectEdges(io, root, nodes).map((e) => ({ from: e.from, to: e.to }));
  return { scope, nodes: irNodes, edges: irEdges };
}

export function graphMermaid(io: GraphFsIo, root: string, opts: GraphOptions = {}): string[] {
  const scope = opts.scope ?? 'active';
  const kinds = parseScope(scope);

  let nodes: GraphNode[];
  if (opts.seed !== undefined) {
    nodes = buildSeedNeighborhood(io, root, opts.seed, opts.depth ?? 1);
  } else {
    nodes = buildDefaultNodes(io, root, kinds);
  }

  if (nodes.length === 0) {
    return [
      'flowchart TD',
      opts.seed !== undefined
        ? `    empty["Change '${opts.seed}' not found or has no relationships"]`
        : `    empty["No changes in scope '${scope}'"]`,
    ];
  }

  const edges = collectEdges(io, root, nodes);
  const nodeIds = nodes.map((n) => n.id);
  const components = connectedComponents(nodeIds, edges);
  const hasArchived = nodes.some((n) => n.archived);
  const hasMissing = nodes.some((n) => !n.present);

  const lines = ['flowchart TD'];
  if (components.length > 1) {
    components.forEach((comp, idx) => {
      const ids = new Set(comp);
      const label = componentLabel(nodes, ids);
      lines.push(`    subgraph sg${idx + 1}["${label}"]`);
      renderNodesAndEdges(nodes, edges, ids, lines, true);
      lines.push('    end');
    });
  } else {
    renderNodesAndEdges(nodes, edges, new Set(nodeIds), lines, false);
  }
  if (hasArchived) lines.push('    classDef archived fill:#d4edda,stroke:#28a745,color:#333');
  if (hasMissing) lines.push('    classDef missing fill:#f8d7da,stroke:#dc3545,color:#333');
  return lines;
}

function renderNodesAndEdges(
  nodes: GraphNode[],
  edges: DepEdge[],
  ids: Set<string>,
  lines: string[],
  indented: boolean,
): void {
  const pad = indented ? '        ' : '    ';
  for (const node of nodes) {
    if (!ids.has(node.id)) continue;
    if (!node.present) lines.push(`${pad}${sanitize(node.id)}["${node.id} ⚠ missing"]:::missing`);
    else if (node.archived)
      lines.push(`${pad}${sanitize(node.id)}["${node.id} ✓ done"]:::archived`);
    else lines.push(`${pad}${sanitize(node.id)}["${node.id}"]`);
  }
  for (const edge of edges) {
    if (!ids.has(edge.from)) continue;
    lines.push(`${pad}${sanitize(edge.from)} -->|depends on| ${sanitize(edge.to)}`);
  }
}

/** Seed neighborhood: bidirectional BFS (depends_on + reverse) over both sets. */
function buildSeedNeighborhood(
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
