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

function collectNodes(io: GraphFsIo, root: string): GraphNode[] {
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
      const deps: string[] = [];
      const fm = io.readText(proposal).match(/^---\n([\s\S]*?)\n---/u);
      if (fm?.[1]) {
        const lines = fm[1].split('\n');
        let inDeps = false;
        for (const line of lines) {
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
      }
      nodes.push({ id, archived, dependsOn: deps });
    }
  };
  scan(`${root}/${CHANGES_DIR}`, false, false);
  // archived nodes appear only when referenced by an active depends_on
  const referenced = new Set(nodes.flatMap((n) => n.dependsOn));
  const archiveDir = `${root}/${CHANGES_DIR}/archive`;
  if (io.exists(archiveDir) && io.isDirectory(archiveDir)) {
    for (const name of io.listDir(archiveDir).toSorted()) {
      if (!/\d{4}-\d{2}-\d{2}-/u.test(name)) continue;
      const id = name.replace(/^\d{4}-\d{2}-\d{2}-/u, '');
      if (!referenced.has(id)) continue;
      // archived nodes keep their real depends_on — v1 emits their edges too
      const deps: string[] = [];
      const proposal = `${archiveDir}/${name}/proposal.md`;
      if (io.exists(proposal)) {
        const fm = io.readText(proposal).match(/^---\n([\s\S]*?)\n---/u);
        let inDeps = false;
        for (const line of fm?.[1]?.split('\n') ?? []) {
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
      }
      nodes.push({ id, archived: true, dependsOn: deps });
    }
  }
  return nodes;
}

export function graphMermaid(io: GraphFsIo, root: string): string[] {
  const nodes = collectNodes(io, root);
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
