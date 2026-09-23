export interface GraphFsIo {
  exists(path: string): boolean;
  readText(path: string): string;
  listDir(path: string): string[];
  isDirectory(path: string): boolean;
}

export interface GraphNode {
  id: string;
  archived: boolean;
  /** true = directory on disk; false = phantom (frozen/removed dependency). */
  present: boolean;
}

export interface DepEdge {
  from: string;
  to: string;
}

export class GraphError extends Error {}

export type ScopeKind = 'active' | 'archived';

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
