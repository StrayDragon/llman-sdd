/**
 * Exclusive Domain Group classifier & spatial band packer for Main View (Axiom 5).
 * Ensures every spec belongs to at most ONE visual domain group with zero overlapping frames.
 */
import type { SpecIndexItem } from '@llman-sdd/core/studio';

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

  return { specPositions, groupBoxes };
}
