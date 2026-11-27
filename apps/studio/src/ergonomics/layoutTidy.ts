// Pure multi-select alignment, distribution & local grid tidy helpers (r157).
// Returns updated cold-table coordinates only; never mutates semantic MachineIR or specs.

export interface NodeBoxInput {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeCoord {
  x: number;
  y: number;
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

export function alignSelectedNodes(
  nodes: readonly NodeBoxInput[],
  mode: AlignMode,
): Record<string, NodeCoord> {
  if (nodes.length < 2) {
    return Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.x), y: Math.round(n.y) }]));
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const out: Record<string, NodeCoord> = {};
  for (const n of nodes) {
    let nx = n.x;
    let ny = n.y;
    if (mode === 'left') nx = minX;
    else if (mode === 'centerX') nx = midX - n.width / 2;
    else if (mode === 'right') nx = maxX - n.width;
    else if (mode === 'top') ny = minY;
    else if (mode === 'centerY') ny = midY - n.height / 2;
    else if (mode === 'bottom') ny = maxY - n.height;
    out[n.id] = { x: Math.round(nx), y: Math.round(ny) };
  }
  return out;
}

export function distributeSelectedNodes(
  nodes: readonly NodeBoxInput[],
  axis: DistributeAxis,
): Record<string, NodeCoord> {
  if (nodes.length < 3) {
    return Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.x), y: Math.round(n.y) }]));
  }
  const out: Record<string, NodeCoord> = {};
  if (axis === 'horizontal') {
    const sorted = [...nodes].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const totalSpan = last.x + last.width - first.x;
    const sumW = sorted.reduce((acc, n) => acc + n.width, 0);
    const gap = Math.max(24, (totalSpan - sumW) / (sorted.length - 1));
    let cursor = first.x;
    for (const n of sorted) {
      out[n.id] = { x: Math.round(cursor), y: Math.round(n.y) };
      cursor += n.width + gap;
    }
  } else {
    const sorted = [...nodes].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const totalSpan = last.y + last.height - first.y;
    const sumH = sorted.reduce((acc, n) => acc + n.height, 0);
    const gap = Math.max(24, (totalSpan - sumH) / (sorted.length - 1));
    let cursor = first.y;
    for (const n of sorted) {
      out[n.id] = { x: Math.round(n.x), y: Math.round(cursor) };
      cursor += n.height + gap;
    }
  }
  return out;
}

export function tidySelectedGrid(
  nodes: readonly NodeBoxInput[],
  gapX = 32,
  gapY = 32,
): Record<string, NodeCoord> {
  if (nodes.length < 2) {
    return Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.x), y: Math.round(n.y) }]));
  }
  const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const originX = Math.min(...sorted.map((n) => n.x));
  const originY = Math.min(...sorted.map((n) => n.y));
  const cols = Math.min(4, Math.ceil(Math.sqrt(sorted.length)));
  const cellW = Math.max(...sorted.map((n) => n.width));
  const cellH = Math.max(...sorted.map((n) => n.height));
  const out: Record<string, NodeCoord> = {};
  sorted.forEach((n, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    out[n.id] = {
      x: Math.round(originX + col * (cellW + gapX)),
      y: Math.round(originY + row * (cellH + gapY)),
    };
  });
  return out;
}

export function nudgeCoord(coord: NodeCoord, key: string, coarse: boolean): NodeCoord | null {
  const step = coarse ? 24 : 8;
  switch (key) {
    case 'ArrowUp':
      return { x: coord.x, y: coord.y - step };
    case 'ArrowDown':
      return { x: coord.x, y: coord.y + step };
    case 'ArrowLeft':
      return { x: coord.x - step, y: coord.y };
    case 'ArrowRight':
      return { x: coord.x + step, y: coord.y };
    default:
      return null;
  }
}
