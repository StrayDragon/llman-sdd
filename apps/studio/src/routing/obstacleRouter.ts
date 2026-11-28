/**
 * Production Obstacle-Aware Edge Router, Edge-to-Edge Mutex, Label Repulsion, and Manual Bend
 * Override (Studio Web Design Axioms 3 & 4, studio-web r147).
 * Pure geometric module — zero DOM dependencies, fully unit-testable.
 */
import type { EdgeBendOffset } from '@llman-sdd/core/studio';

export type EdgePreset = 'bezier' | 'smoothstep' | 'straight';

export interface RectBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type Point2D = [number, number];
export type Segment2D = [Point2D, Point2D];

export interface EndpointBoxes {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  hwA: number;
  hhA: number;
  hwB: number;
  hhB: number;
}

export interface EdgeGeomResult {
  d: string;
  lx: number;
  ly: number;
  samplePts: Point2D[];
}

/** Exact Liang-Barsky line segment vs axis-aligned bounding box intersection. */
export function segIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: RectBox,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const checks: Array<[number, number]> = [
    [-dx, x1 - r.x1],
    [dx, r.x2 - x1],
    [-dy, y1 - r.y1],
    [dy, r.y2 - y1],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-6) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

export function countPolyObstacleHits(
  pts: readonly Point2D[],
  obstacles: readonly RectBox[],
): number {
  let hits = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    for (const r of obstacles) {
      if (segIntersectsRect(p1[0], p1[1], p2[0], p2[1], r)) hits += 1;
    }
  }
  return hits;
}

export function segsCross(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const ccw = (p1: Point2D, p2: Point2D, p3: Point2D): number =>
    (p3[1] - p1[1]) * (p2[0] - p1[0]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
  const d1 = ccw(a, b, c);
  const d2 = ccw(a, b, d);
  const d3 = ccw(c, d, a);
  const d4 = ccw(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < 1e-2 && Math.abs(d2) < 1e-2) {
    const ox =
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) -
      Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]));
    const oy =
      Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) -
      Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]));
    if (ox > 8 || oy > 8) return true;
  }
  return false;
}

export function countEdgeCrossings(
  pts: readonly Point2D[],
  placedSegments: readonly Segment2D[],
): number {
  if (placedSegments.length === 0) return 0;
  let cross = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    for (const seg of placedSegments) {
      if (
        Math.hypot(p1[0] - seg[0][0], p1[1] - seg[0][1]) < 14 ||
        Math.hypot(p2[0] - seg[1][0], p2[1] - seg[1][1]) < 14
      ) {
        continue;
      }
      if (segsCross(p1, p2, seg[0], seg[1])) cross += 1;
    }
  }
  return cross;
}

export function rectsOverlap(a: RectBox, b: RectBox, pad = 4): boolean {
  return a.x1 - pad < b.x2 && a.x2 + pad > b.x1 && a.y1 - pad < b.y2 && a.y2 + pad > b.y1;
}

export function resolveLabelPosition(
  lx: number,
  ly: number,
  width: number,
  height: number,
  placedLabels: RectBox[],
  obstacles: readonly RectBox[],
): { lx: number; ly: number } {
  const offsets: Point2D[] = [
    [0, 0],
    [0, -24],
    [0, 24],
    [0, -48],
    [0, 48],
    [-60, 0],
    [60, 0],
    [-60, -24],
    [60, 24],
    [60, -24],
    [-60, 24],
    [0, -72],
    [0, 72],
    [0, -96],
    [0, 96],
    [0, -124],
    [0, 124],
  ];
  let best = { lx, ly, score: Number.POSITIVE_INFINITY };
  for (const [ox, oy] of offsets) {
    const cx = lx + ox;
    const cy = ly + oy;
    const box: RectBox = {
      x1: cx - width / 2,
      y1: cy - height / 2,
      x2: cx + width / 2,
      y2: cy + height / 2,
    };
    let hits = 0;
    for (const pl of placedLabels) if (rectsOverlap(box, pl, 5)) hits += 10;
    for (const ob of obstacles) if (rectsOverlap(box, ob, 3)) hits += 6;
    const score = hits * 1000 + Math.hypot(ox, oy);
    if (score < best.score) best = { lx: cx, ly: cy, score };
    if (hits === 0) break;
  }
  placedLabels.push({
    x1: best.lx - width / 2,
    y1: best.ly - height / 2,
    x2: best.lx + width / 2,
    y2: best.ly + height / 2,
  });
  return { lx: Math.round(best.lx), ly: Math.round(best.ly) };
}

function polyLength(pts: readonly Point2D[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    len += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  }
  return len;
}

function buildRoundedOrthPath(rawPts: readonly Point2D[], radius = 14): EdgeGeomResult {
  const pts: Point2D[] = [rawPts[0]!];
  for (let i = 1; i < rawPts.length; i += 1) {
    const prev = pts[pts.length - 1]!;
    if (Math.hypot(rawPts[i]![0] - prev[0], rawPts[i]![1] - prev[1]) > 1.5) pts.push(rawPts[i]!);
  }
  if (pts.length < 2) {
    return { d: `M ${pts[0]![0]} ${pts[0]![1]}`, lx: pts[0]![0], ly: pts[0]![1], samplePts: pts };
  }
  if (pts.length === 2) {
    return {
      d: `M ${Math.round(pts[0]![0])} ${Math.round(pts[0]![1])} L ${Math.round(pts[1]![0])} ${Math.round(pts[1]![1])}`,
      lx: Math.round((pts[0]![0] + pts[1]![0]) / 2),
      ly: Math.round((pts[0]![1] + pts[1]![1]) / 2),
      samplePts: pts,
    };
  }
  let d = `M ${Math.round(pts[0]![0])} ${Math.round(pts[0]![1])}`;
  let bestLen = -1;
  let lx = (pts[0]![0] + pts[pts.length - 1]![0]) / 2;
  let ly = (pts[0]![1] + pts[pts.length - 1]![1]) / 2;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const sl = Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
    if (sl > bestLen) {
      bestLen = sl;
      lx = (pts[i]![0] + pts[i + 1]![0]) / 2;
      ly = (pts[i]![1] + pts[i + 1]![1]) / 2;
    }
  }
  for (let i = 1; i < pts.length - 1; i += 1) {
    const pPrev = pts[i - 1]!;
    const pCur = pts[i]!;
    const pNext = pts[i + 1]!;
    const v1x = pCur[0] - pPrev[0];
    const v1y = pCur[1] - pPrev[1];
    const l1 = Math.hypot(v1x, v1y) || 1;
    const v2x = pNext[0] - pCur[0];
    const v2y = pNext[1] - pCur[1];
    const l2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(radius, l1 * 0.45, l2 * 0.45);
    const ax = pCur[0] - (v1x / l1) * r;
    const ay = pCur[1] - (v1y / l1) * r;
    const bx = pCur[0] + (v2x / l2) * r;
    const by = pCur[1] + (v2y / l2) * r;
    d += ` L ${Math.round(ax)} ${Math.round(ay)} Q ${Math.round(pCur[0])} ${Math.round(pCur[1])} ${Math.round(bx)} ${Math.round(by)}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${Math.round(last[0])} ${Math.round(last[1])}`;
  return { d, lx: Math.round(lx), ly: Math.round(ly), samplePts: pts };
}

export function routeObstacleAwareEdge(input: {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  preset: EdgePreset;
  bendX?: number;
  bendY?: number;
  obstacles?: readonly RectBox[];
  endpoints?: EndpointBoxes;
  placedSegments?: readonly Segment2D[];
  manualOffset?: EdgeBendOffset;
}): EdgeGeomResult {
  const {
    sx,
    sy,
    tx,
    ty,
    preset,
    bendX = 0,
    bendY = 0,
    obstacles = [],
    endpoints,
    placedSegments = [],
    manualOffset,
  } = input;

  // User manual drag override takes precedence
  if (manualOffset && (Math.abs(manualOffset.dx) > 1 || Math.abs(manualOffset.dy) > 1)) {
    const cx = (sx + tx) / 2 + bendX + manualOffset.dx * 2;
    const cy = (sy + ty) / 2 + bendY + manualOffset.dy * 2;
    const sp: Point2D[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const mt = 1 - t;
      sp.push([
        mt * mt * sx + 2 * mt * t * cx + t * t * tx,
        mt * mt * sy + 2 * mt * t * cy + t * t * ty,
      ]);
    }
    return {
      d: `M ${Math.round(sx)} ${Math.round(sy)} Q ${Math.round(cx)} ${Math.round(cy)} ${Math.round(tx)} ${Math.round(ty)}`,
      lx: Math.round((sx + 2 * cx + tx) / 4),
      ly: Math.round((sy + 2 * cy + ty) / 4),
      samplePts: sp,
    };
  }

  const baseGeom = ((): EdgeGeomResult => {
    if (preset === 'straight') {
      return {
        d: `M ${Math.round(sx)} ${Math.round(sy)} L ${Math.round(tx)} ${Math.round(ty)}`,
        lx: Math.round((sx + tx) / 2),
        ly: Math.round((sy + ty) / 2),
        samplePts: [
          [sx, sy],
          [tx, ty],
        ],
      };
    }
    if (preset === 'smoothstep') {
      const horiz = Math.abs(tx - sx) >= Math.abs(ty - sy);
      if (horiz) {
        const mx = (sx + tx) / 2 + bendX * 0.35;
        return buildRoundedOrthPath([
          [sx, sy],
          [mx, sy],
          [mx, ty],
          [tx, ty],
        ]);
      }
      const my = (sy + ty) / 2 + bendY * 0.35;
      return buildRoundedOrthPath([
        [sx, sy],
        [sx, my],
        [tx, my],
        [tx, ty],
      ]);
    }
    const cx = (sx + tx) / 2 + bendX;
    const cy = (sy + ty) / 2 + bendY;
    const sp: Point2D[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const mt = 1 - t;
      sp.push([
        mt * mt * sx + 2 * mt * t * cx + t * t * tx,
        mt * mt * sy + 2 * mt * t * cy + t * t * ty,
      ]);
    }
    return {
      d: `M ${Math.round(sx)} ${Math.round(sy)} Q ${Math.round(cx)} ${Math.round(cy)} ${Math.round(tx)} ${Math.round(ty)}`,
      lx: Math.round((sx + 2 * cx + tx) / 4),
      ly: Math.round((sy + 2 * cy + ty) / 4),
      samplePts: sp,
    };
  })();

  if (obstacles.length === 0) return baseGeom;
  const baseHits = countPolyObstacleHits(baseGeom.samplePts, obstacles);
  const baseCross = countEdgeCrossings(baseGeom.samplePts, placedSegments);
  if (baseHits === 0 && baseCross === 0) return baseGeom;

  const ax = endpoints ? endpoints.ax : sx;
  const ay = endpoints ? endpoints.ay : sy;
  const bx = endpoints ? endpoints.bx : tx;
  const by = endpoints ? endpoints.by : ty;
  const hwA = endpoints ? endpoints.hwA : 0;
  const hhA = endpoints ? endpoints.hhA : 0;
  const hwB = endpoints ? endpoints.hwB : 0;
  const hhB = endpoints ? endpoints.hhB : 0;
  const pad = 26;

  const gMinX = Math.min(ax - hwA, bx - hwB, ...obstacles.map((o) => o.x1)) - pad;
  const gMaxX = Math.max(ax + hwA, bx + hwB, ...obstacles.map((o) => o.x2)) + pad;
  const gMinY = Math.min(ay - hhA, by - hhB, ...obstacles.map((o) => o.y1)) - pad;
  const gMaxY = Math.max(ay + hhA, by + hhB, ...obstacles.map((o) => o.y2)) + pad;

  const xs = [
    ...new Set([
      gMinX,
      gMaxX,
      (ax + bx) / 2,
      ...obstacles.flatMap((o) => [o.x1 - pad, o.x2 + pad]),
    ]),
  ];
  const ys = [
    ...new Set([
      gMinY,
      gMaxY,
      (ay + by) / 2,
      ...obstacles.flatMap((o) => [o.y1 - pad, o.y2 + pad]),
    ]),
  ];
  const sortedX = [...obstacles].sort((u, v) => u.x1 - v.x1);
  for (let i = 0; i < sortedX.length - 1; i += 1) {
    if (sortedX[i + 1]!.x1 - sortedX[i]!.x2 > 14)
      xs.push((sortedX[i]!.x2 + sortedX[i + 1]!.x1) / 2);
  }
  const sortedY = [...obstacles].sort((u, v) => u.y1 - v.y1);
  for (let i = 0; i < sortedY.length - 1; i += 1) {
    if (sortedY[i + 1]!.y1 - sortedY[i]!.y2 > 14)
      ys.push((sortedY[i]!.y2 + sortedY[i + 1]!.y1) / 2);
  }

  const candidates: Array<{ pts: Point2D[]; isBase?: boolean }> = [];
  if (baseHits === 0) candidates.push({ pts: baseGeom.samplePts, isBase: true });
  for (const lx of xs) {
    const sSide = lx < ax ? ax - hwA : ax + hwA;
    const tSide = lx < bx ? bx - hwB - 6 : bx + hwB + 6;
    candidates.push({
      pts: [
        [sSide, ay],
        [lx, ay],
        [lx, by],
        [tSide, by],
      ],
    });
  }
  for (const ly of ys) {
    const sSide = ly < ay ? ay - hhA : ay + hhA;
    const tSide = ly < by ? by - hhB - 6 : by + hhB + 6;
    candidates.push({
      pts: [
        [ax, sSide],
        [ax, ly],
        [bx, ly],
        [bx, tSide],
      ],
    });
  }
  const nearYA = [ay - hhA - pad, ay + hhA + pad];
  const nearYB = [by - hhB - pad, by + hhB + pad];
  for (const ya of nearYA) {
    const saY = ya < ay ? ay - hhA : ay + hhA;
    for (const yb of nearYB) {
      const tbY = yb < by ? by - hhB - 6 : by + hhB + 6;
      for (const lx of xs) {
        candidates.push({
          pts: [
            [ax, saY],
            [ax, ya],
            [lx, ya],
            [lx, yb],
            [bx, yb],
            [bx, tbY],
          ],
        });
      }
    }
  }

  let best: { pts: Point2D[]; isBase?: boolean } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const cand of candidates) {
    const hits = countPolyObstacleHits(cand.pts, obstacles);
    const crosses = countEdgeCrossings(cand.pts, placedSegments);
    const score = hits * 1_000_000 + crosses * 12_000 + polyLength(cand.pts) + cand.pts.length * 18;
    if (score < bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  if (!best || best.isBase) return baseGeom;
  return buildRoundedOrthPath(best.pts, 14);
}
