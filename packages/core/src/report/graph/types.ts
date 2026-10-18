import { type FsPort } from '../../util/fsPort.ts';
export type GraphFsIo = Pick<FsPort, 'exists' | 'readText' | 'listDir' | 'isDirectory'>;

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
  /** r58: max recursion depth when scanning changes/ for proposals (default 8). */
  maxScanDepth?: number;
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
