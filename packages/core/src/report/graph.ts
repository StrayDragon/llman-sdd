/**
 * Change dependency graph (peripheral-commands capability, r21):
 * mermaid output with v1 conventions — node ids dash→underscore, archived
 * changes annotated "✓ done" with the archived class, depends_on edges.
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
  dependsOn: string[];
}

/** Extract depends_on entries from a proposal's YAML frontmatter. */
function parseDeps(proposal: string): string[] {
  const fm = proposal.match(/^---\n([\s\S]*?)\n---/u);
  const deps: string[] = [];
  if (!fm?.[1]) return deps;
  let inDeps = false;
  for (const line of fm[1].split('\n')) {
    // Flow style — `depends_on: [a, b]` (what `change new` scaffolds and the
    // natural one-line edit; malformed content like `[add-` yields nothing).
    const flow = line.match(/^depends_on:\s*\[([^\]]*)\]\s*$/u);
    if (flow) {
      for (const item of flow[1]?.split(',') ?? []) {
        const dep = item.trim().replaceAll(/^['"]|['"]$/gu, '');
        if (dep !== '') deps.push(dep);
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
      if (m?.[1]) deps.push(m[1]);
      else if (line.trim() !== '') inDeps = false;
    }
  }
  return deps;
}

function collectNodes(io: GraphFsIo, root: string, opts: GraphOptions): GraphNode[] {
  const scopeTokens = new Set((opts.scope ?? 'active').split(',').map((t) => t.trim()));
  const includeActive = scopeTokens.has('active') || scopeTokens.has('all');
  const includeArchived = scopeTokens.has('archived') || scopeTokens.has('all');
  const nodes: GraphNode[] = [];
  const scan = (dir: string, archived: boolean, stripDatePrefix: boolean): void => {
    if (!io.exists(dir) || !io.isDirectory(dir)) return;
    for (const name of io.listDir(dir).toSorted()) {
      if (name === 'archive') continue;
      const full = `${dir}/${name}`;
      if (!io.isDirectory(full)) continue;
      const proposal = `${full}/proposal.md`;
      if (!io.exists(proposal)) continue;
      const id = archived && stripDatePrefix ? name.replace(/^\d{4}-\d{2}-\d{2}-/u, '') : name;
      nodes.push({ id, archived, dependsOn: parseDeps(io.readText(proposal)) });
    }
  };
  if (includeActive) scan(`${root}/${CHANGES_DIR}`, false, false);
  const archivedNodes: GraphNode[] = [];
  const archiveDir = `${root}/${CHANGES_DIR}/archive`;
  if (io.exists(archiveDir) && io.isDirectory(archiveDir)) {
    const referenced = new Set(nodes.flatMap((n) => n.dependsOn));
    for (const name of io.listDir(archiveDir).toSorted()) {
      if (!/\d{4}-\d{2}-\d{2}-/u.test(name)) continue;
      const id = name.replace(/^\d{4}-\d{2}-\d{2}-/u, '');
      // active scope: archived only when referenced (v1 parity); archived/all: all
      if (!includeArchived && !referenced.has(id)) continue;
      // archived nodes keep their real depends_on — v1 emits their edges too
      const proposal = `${archiveDir}/${name}/proposal.md`;
      const deps = io.exists(proposal) ? parseDeps(io.readText(proposal)) : [];
      archivedNodes.push({ id, archived: true, dependsOn: deps });
    }
  }
  return [...nodes, ...archivedNodes];
}

export interface GraphOptions {
  /** comma-combined scope: active | archived | all (default: active) */
  scope?: string;
  /** seed BFS depth over depends_on (default: 1); 0 = seed only */
  depth?: number;
  /** seed change id */
  seed?: string;
}

export function graphMermaid(io: GraphFsIo, root: string, opts: GraphOptions = {}): string[] {
  let nodes = collectNodes(io, root, opts);
  // seed: keep the seed and its depends_on closure up to depth (r54)
  if (opts.seed !== undefined) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const maxDepth = opts.depth ?? 1;
    const keep = new Set<string>();
    const queue: [string, number][] = [[opts.seed, 0]];
    const seen = new Set<string>([opts.seed]);
    while (queue.length > 0) {
      const [current, d] = queue.shift() as [string, number];
      keep.add(current);
      if (d >= maxDepth) continue;
      const node = byId.get(current);
      if (node === undefined) continue;
      for (const dep of node.dependsOn) {
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push([dep, d + 1]);
        }
      }
    }
    nodes = nodes.filter((n) => keep.has(n.id));
  }
  const lines: string[] = ['flowchart TD'];
  for (const node of nodes) {
    const nid = node.id.replaceAll('-', '_');
    const label = node.archived ? `${node.id} ✓ done` : node.id;
    lines.push(`    ${nid}["${label}"]${node.archived ? ':::archived' : ''}`);
  }
  const byId = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      // edges render only when both endpoints are shown nodes
      if (!byId.has(dep)) continue;
      lines.push(`    ${node.id.replaceAll('-', '_')} -->|depends on| ${dep.replaceAll('-', '_')}`);
    }
  }
  lines.push('    classDef archived fill:#d4edda,stroke:#28a745,color:#333');
  return lines;
}
