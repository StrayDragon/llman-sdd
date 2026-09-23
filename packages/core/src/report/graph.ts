/**
 * Change dependency graph (peripheral-commands capability, r21/r30/r54):
 * v1 `commands/graph.rs` observable contract — scope parsing, connected
 * component subgraphs, conditional classDef, empty placeholder, bidirectional
 * seed BFS, error paths. Pure: IO injected.
 *
 * Implementation split under `graph/` (pure mechanical move, no behavior
 * change); this file stays the public barrel.
 */

export { GraphError, type GraphFsIo } from './graph/types.ts';
export type { GraphOptions, GraphNodeIr, GraphEdgeIr, GraphDataIr } from './graph/types.ts';
export { parseDeps } from './graph/deps.ts';
export { graphData } from './graph/graphData.ts';
export { graphMermaid } from './graph/render.ts';
