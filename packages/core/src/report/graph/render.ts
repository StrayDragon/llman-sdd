import {
  buildDefaultNodes,
  buildSeedNeighborhood,
  collectEdges,
  connectedComponents,
} from './analysis.ts';
import { parseScope } from './graphData.ts';
import type { DepEdge, GraphFsIo, GraphNode, GraphOptions } from './types.ts';

function componentLabel(nodes: GraphNode[], ids: Set<string>): string {
  const comp = nodes.filter((n) => ids.has(n.id));
  const allActive = comp.every((n) => !n.archived && n.present);
  const allArchived = comp.every((n) => n.archived);
  if (allActive) return 'Active';
  if (allArchived) return 'Done';
  return 'Mixed';
}

const sanitize = (id: string): string => id.replaceAll('-', '_');

export function graphMermaid(io: GraphFsIo, root: string, opts: GraphOptions = {}): string[] {
  const scope = opts.scope ?? 'active';
  const kinds = parseScope(scope);

  let nodes: GraphNode[];
  if (opts.seed !== undefined) {
    nodes = buildSeedNeighborhood(io, root, opts.seed, opts.depth ?? 1, opts.maxScanDepth);
  } else {
    nodes = buildDefaultNodes(io, root, kinds, opts.maxScanDepth);
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
