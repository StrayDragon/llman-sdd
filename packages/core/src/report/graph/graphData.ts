import { buildDefaultNodes, buildSeedNeighborhood, collectEdges } from './analysis.ts';
import {
  GraphError,
  type GraphDataIr,
  type GraphEdgeIr,
  type GraphFsIo,
  type GraphNode,
  type GraphNodeIr,
  type GraphOptions,
  type ScopeKind,
} from './types.ts';

export function parseScope(scope: string): ScopeKind[] {
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
