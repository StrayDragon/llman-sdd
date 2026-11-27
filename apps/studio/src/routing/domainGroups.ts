/**
 * Exclusive Domain Group classifier & spatial band packer for Main View (Axiom 5).
 * Ensures every spec belongs to at most ONE visual domain group with zero overlapping frames.
 */
import type {
  ForestEdgeEvidence,
  SpecIndexEdge,
  SpecIndexItem,
  StudioManualGroup,
} from '@llman-sdd/core/studio';

export type GroupTone = 'blue' | 'teal' | 'violet' | 'amber';

export interface VisualDomainGroup {
  id: string;
  title: string;
  tone: GroupTone;
  memberIds: string[];
}

interface DomainRule {
  id: string;
  title: string;
  tone: GroupTone;
  match: (spec: SpecIndexItem) => boolean;
}

const KNOWN_DOMAIN_RULES: DomainRule[] = [
  {
    id: 'dom-lifecycle',
    title: '生命周期与校验域',
    tone: 'blue',
    match: (s) =>
      /^(change-lifecycle|review-freeze|spec-authoring|spec-parsing|validation)$/u.test(s.id),
  },
  {
    id: 'dom-cli',
    title: 'CLI 与外围命令域',
    tone: 'teal',
    match: (s) =>
      /^(cli|completion|eval-playbook|init-generators|peripheral-commands)$/u.test(s.id),
  },
  {
    id: 'dom-studio',
    title: 'Studio 控制面域',
    tone: 'violet',
    match: (s) => s.id.startsWith('studio-'),
  },
  {
    id: 'dom-config',
    title: '配置与工程骨架域',
    tone: 'amber',
    match: (s) => /^(config-|monorepo-structure|scope-boundaries)/u.test(s.id),
  },
];

const FALLBACK_TONES: GroupTone[] = ['blue', 'teal', 'violet', 'amber'];

/**
 * Partition specs into mutually exclusive domain groups (Axiom 5).
 * Recognizes known llman-sdd domains and automatically groups arbitrary repos by prefix/kind.
 */
export function buildExclusiveDomainGroups(
  specs: SpecIndexItem[],
  ungroupedDomains: Set<string>,
): {
  groups: VisualDomainGroup[];
  ungroupedIds: string[];
} {
  const assigned = new Set<string>();
  const groups: VisualDomainGroup[] = [];

  for (const rule of KNOWN_DOMAIN_RULES) {
    const members = specs.filter((s) => !assigned.has(s.id) && rule.match(s)).map((s) => s.id);
    if (members.length >= 2) {
      for (const id of members) assigned.add(id);
      if (!ungroupedDomains.has(rule.id)) {
        groups.push({ id: rule.id, title: rule.title, tone: rule.tone, memberIds: members });
      }
    }
  }

  // Group remaining unassigned specs by prefix if >= 2 share a prefix
  const remaining = specs.filter((s) => !assigned.has(s.id));
  const byPrefix = new Map<string, string[]>();
  for (const s of remaining) {
    const prefix = s.id.split('-')[0] ?? s.kind;
    const list = byPrefix.get(prefix) ?? [];
    list.push(s.id);
    byPrefix.set(prefix, list);
  }
  let toneIdx = groups.length;
  for (const [prefix, ids] of byPrefix.entries()) {
    if (ids.length >= 2) {
      const gid = `dom-${prefix}`;
      for (const id of ids) assigned.add(id);
      if (!ungroupedDomains.has(gid)) {
        groups.push({
          id: gid,
          title: `${prefix} 能力域`,
          tone: FALLBACK_TONES[toneIdx % FALLBACK_TONES.length]!,
          memberIds: ids,
        });
        toneIdx += 1;
      }
    }
  }

  const groupedMemberSet = new Set(groups.flatMap((g) => g.memberIds));
  const ungroupedIds = specs.filter((s) => !groupedMemberSet.has(s.id)).map((s) => s.id);
  return { groups, ungroupedIds };
}

export interface GroupLayoutResult {
  specPositions: Record<string, { x: number; y: number }>;
  groupBoxes: Array<{
    group: VisualDomainGroup;
    x: number;
    y: number;
    width: number;
    height: number;
    collapsed: boolean;
  }>;
}

/**
 * Deterministic non-overlapping vertical band layout guaranteeing zero group-on-group overlap
 * and clean spacing across glyph / map / detail tiers.
 */
export function layoutMainViewWithGroups(
  specs: SpecIndexItem[],
  groups: VisualDomainGroup[],
  ungroupedIds: string[],
  collapsedGroups: Set<string>,
  savedPositions: Record<string, { x: number; y: number }>,
  tier: 'glyph' | 'map' | 'detail',
): GroupLayoutResult {
  const cardW = tier === 'glyph' ? 148 : tier === 'detail' ? 304 : 254;
  const cardH = tier === 'glyph' ? 132 : tier === 'detail' ? 218 : 158;
  const colGap = 32;
  const rowGap = 32;
  const maxCols = tier === 'detail' ? 4 : 5;
  const padX = 24;
  const padTop = 36;
  const padBottom = 22;

  const specPositions: Record<string, { x: number; y: number }> = {};
  const groupBoxes: GroupLayoutResult['groupBoxes'] = [];
  let cursorY = 72;

  for (const group of groups) {
    const collapsed = collapsedGroups.has(group.id);
    if (collapsed) {
      groupBoxes.push({
        group,
        x: 48,
        y: cursorY,
        width: 280,
        height: 132,
        collapsed: true,
      });
      cursorY += 168;
      continue;
    }

    const cols = Math.min(maxCols, Math.max(1, group.memberIds.length));
    const rows = Math.ceil(group.memberIds.length / cols);
    const naturalBandH = padTop + rows * (cardH + rowGap) + padBottom;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Validate saved positions against this group's exclusive vertical band so stale flat-grid coords
    // never stretch a group frame into a tall empty void (Axiom 5).
    const bandTop = cursorY - 40;
    const bandBottom = cursorY + naturalBandH + 140;
    const allSavedInsideBand = group.memberIds.every((id) => {
      const sp = savedPositions[id];
      return !sp || (sp.y >= bandTop && sp.y + cardH <= bandBottom);
    });

    group.memberIds.forEach((id, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const defaultPos = {
        x: 48 + padX + col * (cardW + colGap),
        y: cursorY + padTop + row * (cardH + rowGap),
      };
      const pos = allSavedInsideBand ? (savedPositions[id] ?? defaultPos) : defaultPos;
      specPositions[id] = pos;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + cardW);
      maxY = Math.max(maxY, pos.y + cardH);
    });

    const boxX = Number.isFinite(minX) ? minX - padX : 48;
    const boxY = Number.isFinite(minY) ? minY - padTop : cursorY;
    const boxW = Number.isFinite(maxX) ? maxX - boxX + padX : cols * (cardW + colGap) + padX * 2;
    const boxH = Number.isFinite(maxY)
      ? maxY - boxY + padBottom
      : padTop + rows * (cardH + rowGap) + padBottom;

    groupBoxes.push({
      group,
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      collapsed: false,
    });
    cursorY = Math.max(cursorY + padTop + rows * (cardH + rowGap) + padBottom, boxY + boxH) + 46;
  }

  // Place ungrouped specs cleanly below all groups
  const specSet = new Set(specs.map((s) => s.id));
  const validUngrouped = ungroupedIds.filter((id) => specSet.has(id));
  validUngrouped.forEach((id, idx) => {
    const col = idx % maxCols;
    const row = Math.floor(idx / maxCols);
    specPositions[id] = savedPositions[id] ?? {
      x: 48 + padX + col * (cardW + colGap),
      y: cursorY + row * (cardH + rowGap),
    };
  });

  // Enforce Exclusive Space Guard (Axiom 5 / r155): guarantee NO group box ever encloses a non-member!
  enforceExclusiveGroupSpaces(specPositions, groupBoxes, cardW, cardH);

  return { specPositions, groupBoxes };
}

/**
 * Merge workspace manual groups with auto-detected exclusive domain groups (manual groups win first).
 */
export function buildExclusiveDomainGroupsWithManual(
  specs: SpecIndexItem[],
  manualGroups: readonly StudioManualGroup[],
  ungroupedDomains: Set<string>,
): {
  groups: VisualDomainGroup[];
  ungroupedIds: string[];
} {
  const specIds = new Set(specs.map((s) => s.id));
  const assigned = new Set<string>();
  const custom: VisualDomainGroup[] = [];

  manualGroups.forEach((mg, idx) => {
    const members = mg.capabilities.filter((id) => specIds.has(id) && !assigned.has(id));
    if (members.length === 0) return;
    for (const id of members) assigned.add(id);
    const tone: GroupTone =
      mg.tone === 'blue' || mg.tone === 'teal' || mg.tone === 'violet' || mg.tone === 'amber'
        ? mg.tone
        : FALLBACK_TONES[idx % FALLBACK_TONES.length]!;
    if (!ungroupedDomains.has(mg.id)) {
      custom.push({ id: mg.id, title: mg.title, tone, memberIds: members });
    }
  });

  const remainingSpecs = specs.filter((s) => !assigned.has(s.id));
  const auto = buildExclusiveDomainGroups(remainingSpecs, ungroupedDomains);
  return {
    groups: [...custom, ...auto.groups],
    ungroupedIds: auto.ungroupedIds,
  };
}

/**
 * Exclusive Space Guard (studio-web r155):
 * Ensures no domain group bounding box ever overlaps or mistakenly encloses any non-member spec card.
 * Displaces offending non-member cards cleanly below all conflicting group frames.
 */
export function enforceExclusiveGroupSpaces(
  specPositions: Record<string, { x: number; y: number }>,
  groupBoxes: GroupLayoutResult['groupBoxes'],
  cardW: number,
  cardH: number,
  margin = 20,
): void {
  const expandedBoxes = groupBoxes.filter((gb) => !gb.collapsed);
  if (expandedBoxes.length === 0) return;

  const overlapsBox = (
    pos: { x: number; y: number },
    gb: GroupLayoutResult['groupBoxes'][number],
  ): boolean =>
    pos.x < gb.x + gb.width + margin &&
    pos.x + cardW > gb.x - margin &&
    pos.y < gb.y + gb.height + margin &&
    pos.y + cardH > gb.y - margin;

  for (const [specId, pos] of Object.entries(specPositions)) {
    let cur = { ...pos };
    for (let pass = 0; pass < 6; pass += 1) {
      const hit = expandedBoxes.find(
        (gb) => !gb.group.memberIds.includes(specId) && overlapsBox(cur, gb),
      );
      if (!hit) break;
      cur = { x: cur.x, y: Math.round(hit.y + hit.height + margin + 12) };
    }
    specPositions[specId] = cur;
  }
}

/**
 * Compute 1-hop external capability ids connected to a custom Forest Tab's included subset.
 */
export function computeOneHopExternalCaps(
  includedIds: readonly string[],
  macroEdges: readonly SpecIndexEdge[],
): string[] {
  const base = new Set(includedIds);
  const ext = new Set<string>();
  for (const e of macroEdges) {
    if (base.has(e.from) && !base.has(e.to)) ext.add(e.to);
    if (base.has(e.to) && !base.has(e.from)) ext.add(e.from);
  }
  return Array.from(ext);
}

/**
 * Compute direct 1-hop adjacency set around a focal capability for large-graph Focus Adjacency mode.
 */
export function computeFocusAdjacencySet(
  focalCapId: string,
  macroEdges: readonly SpecIndexEdge[],
): Set<string> {
  const set = new Set<string>([focalCapId]);
  for (const e of macroEdges) {
    if (e.from === focalCapId) set.add(e.to);
    if (e.to === focalCapId) set.add(e.from);
  }
  return set;
}

/**
 * Extract cross-spec contract evidence list for an upstream/downstream Boundary Portal pill.
 */
export function extractPortalEvidence(
  currentCapId: string,
  direction: 'upstream' | 'downstream',
  portalCapId: string,
  macroEdges: readonly SpecIndexEdge[],
): ForestEdgeEvidence[] {
  const matched = macroEdges.filter((e) =>
    direction === 'upstream'
      ? e.from === portalCapId && e.to === currentCapId
      : e.from === currentCapId && e.to === portalCapId,
  );
  const out: ForestEdgeEvidence[] = [];
  for (const edge of matched) {
    if (edge.evidence && edge.evidence.length > 0) {
      out.push(...edge.evidence);
    } else {
      out.push({ summary: `${edge.from} -> ${edge.to} (${edge.label})` });
    }
  }
  return out;
}
