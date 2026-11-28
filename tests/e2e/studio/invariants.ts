// Pure geometry judge for Studio Web real-browser E2E invariants (r156).
// Browser-agnostic: the Playwright collector (run.ts) feeds DOM/SVG snapshots in,
// BDD and unit tests feed synthetic snapshots in. Zero I/O.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IdRect extends Rect {
  id: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface EdgeSample {
  id: string;
  source: string;
  target: string;
  points: readonly Point[];
}

export interface GroupBox extends Rect {
  id: string;
  memberIds: readonly string[];
}

export interface StudioGeometrySnapshot {
  viewport: { width: number; height: number };
  /** Worldline drawer rect when open; null when closed. */
  drawer: Rect | null;
  /** Rect of the control that opened the drawer. */
  drawerTrigger: Rect | null;
  minimap: Rect | null;
  /** Visible floating bars in the top-center slot (tips / compare / diagnostics). */
  topSlots: readonly Rect[];
  nodes: readonly IdRect[];
  edges: readonly EdgeSample[];
  edgeLabels: readonly IdRect[];
  groups: readonly GroupBox[];
  /** Visible chrome text (user spec content excluded by the collector). */
  chromeText: string;
}

export type StudioInvariantId =
  | 'drawer-same-side'
  | 'top-slot-exclusive'
  | 'edge-no-card-cross'
  | 'label-no-overlap'
  | 'group-exclusive'
  | 'copy-hygiene';

export interface StudioInvariantViolation {
  invariant: StudioInvariantId;
  detail: string;
}

/** Pixel tolerance so anti-aliased borders touching does not count as overlap. */
const EPS = 2;
const DEFAULT_VIEWPORT = { width: 1440, height: 900 } as const;

export function rectsIntersect(a: Rect, b: Rect, eps = EPS): boolean {
  return (
    a.x + eps < b.x + b.width &&
    b.x + eps < a.x + a.width &&
    a.y + eps < b.y + b.height &&
    b.y + eps < a.y + a.height
  );
}

function pointInside(p: Point, r: Rect, eps = EPS): boolean {
  return (
    p.x > r.x + eps && p.x < r.x + r.width - eps && p.y > r.y + eps && p.y < r.y + r.height - eps
  );
}

function centerX(r: Rect): number {
  return r.x + r.width / 2;
}

export function checkDrawerSameSide(s: StudioGeometrySnapshot): StudioInvariantViolation[] {
  if (!s.drawer) return [];
  const out: StudioInvariantViolation[] = [];
  if (s.drawerTrigger) {
    const half = s.viewport.width / 2;
    const triggerRight = centerX(s.drawerTrigger) >= half;
    const drawerRight = centerX(s.drawer) >= half;
    if (triggerRight !== drawerRight) {
      out.push({
        invariant: 'drawer-same-side',
        detail: 'drawer opens on the opposite side of its trigger',
      });
    }
  }
  if (s.drawer.x + s.drawer.width > s.viewport.width + EPS || s.drawer.x < -EPS) {
    out.push({ invariant: 'drawer-same-side', detail: 'drawer overflows the viewport' });
  }
  if (s.minimap && rectsIntersect(s.drawer, s.minimap)) {
    out.push({ invariant: 'drawer-same-side', detail: 'drawer overlaps the minimap' });
  }
  return out;
}

export function checkTopSlotExclusive(s: StudioGeometrySnapshot): StudioInvariantViolation[] {
  if (s.topSlots.length <= 1) return [];
  return [
    {
      invariant: 'top-slot-exclusive',
      detail: `${String(s.topSlots.length)} floating bars visible in the top-center slot`,
    },
  ];
}

export function checkEdgeNoCardCross(s: StudioGeometrySnapshot): StudioInvariantViolation[] {
  const out: StudioInvariantViolation[] = [];
  for (const edge of s.edges) {
    for (const node of s.nodes) {
      if (node.id === edge.source || node.id === edge.target) continue;
      if (edge.points.some((p) => pointInside(p, node, 4))) {
        out.push({
          invariant: 'edge-no-card-cross',
          detail: `edge ${edge.id} crosses card ${node.id}`,
        });
      }
    }
  }
  return out;
}

export function checkLabelNoOverlap(s: StudioGeometrySnapshot): StudioInvariantViolation[] {
  const out: StudioInvariantViolation[] = [];
  const labels = s.edgeLabels;
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const a = labels[i]!;
      const b = labels[j]!;
      if (rectsIntersect(a, b)) {
        out.push({ invariant: 'label-no-overlap', detail: `labels ${a.id} and ${b.id} overlap` });
      }
    }
    for (const node of s.nodes) {
      if (rectsIntersect(labels[i]!, node)) {
        out.push({
          invariant: 'label-no-overlap',
          detail: `label ${labels[i]!.id} covers card ${node.id}`,
        });
      }
    }
  }
  return out;
}

export function checkGroupExclusive(s: StudioGeometrySnapshot): StudioInvariantViolation[] {
  const out: StudioInvariantViolation[] = [];
  for (const g of s.groups) {
    const members = new Set(g.memberIds);
    for (const node of s.nodes) {
      if (members.has(node.id)) continue;
      if (rectsIntersect(g, node)) {
        out.push({
          invariant: 'group-exclusive',
          detail: `group ${g.id} encloses non-member ${node.id}`,
        });
      }
    }
  }
  for (let i = 0; i < s.groups.length; i += 1) {
    for (let j = i + 1; j < s.groups.length; j += 1) {
      if (rectsIntersect(s.groups[i]!, s.groups[j]!)) {
        out.push({
          invariant: 'group-exclusive',
          detail: `groups ${s.groups[i]!.id} and ${s.groups[j]!.id} intersect`,
        });
      }
    }
  }
  return out;
}

/** Colorful emoji: default-emoji-presentation code points or explicit VS16 emoji. */
const COLOR_EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u;
const DEV_COPY_RE = /预留|占位|原型|\[DEMO-SIM\]|TODO|FIXME|Lorem ipsum/u;

export function checkCopyHygiene(s: StudioGeometrySnapshot): StudioInvariantViolation[] {
  const out: StudioInvariantViolation[] = [];
  const emoji = COLOR_EMOJI_RE.exec(s.chromeText);
  if (emoji)
    out.push({ invariant: 'copy-hygiene', detail: `colorful emoji in chrome: ${emoji[0]}` });
  const dev = DEV_COPY_RE.exec(s.chromeText);
  if (dev) out.push({ invariant: 'copy-hygiene', detail: `dev-stage copy in chrome: ${dev[0]}` });
  return out;
}

export function checkStudioInvariants(s: StudioGeometrySnapshot): StudioInvariantViolation[] {
  return [
    ...checkDrawerSameSide(s),
    ...checkTopSlotExclusive(s),
    ...checkEdgeNoCardCross(s),
    ...checkLabelNoOverlap(s),
    ...checkGroupExclusive(s),
    ...checkCopyHygiene(s),
  ];
}

export function emptySnapshot(
  viewport: { width: number; height: number } = DEFAULT_VIEWPORT,
): StudioGeometrySnapshot {
  return {
    viewport,
    drawer: null,
    drawerTrigger: null,
    minimap: null,
    topSlots: [],
    nodes: [],
    edges: [],
    edgeLabels: [],
    groups: [],
    chromeText: '',
  };
}

/** Synthetic fixtures shared by BDD (r156) and unit tests. */
export function buildCleanSnapshot(): StudioGeometrySnapshot {
  return {
    ...emptySnapshot(),
    drawer: { x: 1060, y: 60, width: 360, height: 600 },
    drawerTrigger: { x: 1340, y: 12, width: 80, height: 28 },
    minimap: { x: 820, y: 720, width: 200, height: 150 },
    topSlots: [{ x: 520, y: 40, width: 400, height: 28 }],
    nodes: [
      { id: 'a', x: 100, y: 100, width: 200, height: 80 },
      { id: 'b', x: 500, y: 100, width: 200, height: 80 },
      { id: 'c', x: 100, y: 400, width: 200, height: 80 },
    ],
    edges: [
      {
        id: 'a-b',
        source: 'a',
        target: 'b',
        points: [
          { x: 300, y: 140 },
          { x: 400, y: 140 },
          { x: 500, y: 140 },
        ],
      },
    ],
    edgeLabels: [
      { id: 'l1', x: 360, y: 120, width: 60, height: 18 },
      { id: 'l2', x: 360, y: 300, width: 60, height: 18 },
    ],
    groups: [{ id: 'g1', x: 80, y: 80, width: 640, height: 120, memberIds: ['a', 'b'] }],
    chromeText: '主视图 世界线 校验通过 保存变更',
  };
}

export function buildViolatingSnapshot(): StudioGeometrySnapshot {
  const clean = buildCleanSnapshot();
  return {
    ...clean,
    drawer: { x: 0, y: 60, width: 360, height: 600 },
    minimap: { x: 100, y: 500, width: 200, height: 150 },
    topSlots: [
      { x: 520, y: 40, width: 400, height: 28 },
      { x: 520, y: 72, width: 400, height: 28 },
    ],
    edges: [
      {
        id: 'a-c-through-b',
        source: 'a',
        target: 'c',
        points: [
          { x: 300, y: 140 },
          { x: 600, y: 140 },
          { x: 200, y: 400 },
        ],
      },
    ],
    edgeLabels: [
      { id: 'l1', x: 360, y: 120, width: 60, height: 18 },
      { id: 'l2', x: 370, y: 125, width: 60, height: 18 },
    ],
    groups: [{ id: 'g1', x: 80, y: 80, width: 640, height: 420, memberIds: ['a', 'b'] }],
    chromeText: '主视图 🚀 预留按钮',
  };
}

export const ALL_STUDIO_INVARIANTS: readonly StudioInvariantId[] = [
  'drawer-same-side',
  'top-slot-exclusive',
  'edge-no-card-cross',
  'label-no-overlap',
  'group-exclusive',
  'copy-hygiene',
];
