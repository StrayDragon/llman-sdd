import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { buildDemoStudioWebDrafts } from '@llman-sdd/core';

import { renderMermaidDiagram } from '../../apps/studio/src/components/ChangeDagPanel.tsx';
import {
  buildExclusiveDomainGroups,
  layoutMainViewWithGroups,
} from '../../apps/studio/src/routing/domainGroups.ts';
import {
  countPolyObstacleHits,
  rectsOverlap,
  resolveLabelPosition,
  routeObstacleAwareEdge,
  type RectBox,
  type Segment2D,
} from '../../apps/studio/src/routing/obstacleRouter.ts';
import { createMachineSimulationSession } from '../../apps/studio/src/simulate/xstateCompiler.ts';

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('studio-web frontend pure logic, routing axioms & pele smoke (r147, r148)', () => {
  test('obstacle-aware corridor router produces zero card hits & zero label overlaps', () => {
    const obstacles: RectBox[] = [
      { x1: 40, y1: 280, x2: 300, y2: 440 },
      { x1: 40, y1: 550, x2: 300, y2: 710 },
      { x1: 40, y1: 820, x2: 300, y2: 980 },
    ];
    const placedSegs: Segment2D[] = [];
    const placedLabels: RectBox[] = [];

    const routed = routeObstacleAwareEdge({
      sx: 170,
      sy: 200,
      tx: 170,
      ty: 1120,
      preset: 'bezier',
      obstacles,
      endpoints: { ax: 170, ay: 135, bx: 170, by: 1185, hwA: 128, hhA: 65, hwB: 128, hhB: 65 },
      placedSegments: placedSegs,
    });
    expect(countPolyObstacleHits(routed.samplePts, obstacles)).toBe(0);

    // Label repulsion ensures zero overlap between colliding label positions
    const l1 = resolveLabelPosition(500, 300, 110, 22, placedLabels, []);
    const l2 = resolveLabelPosition(500, 300, 110, 22, placedLabels, []);
    expect(
      rectsOverlap(
        { x1: l1.lx - 55, y1: l1.ly - 11, x2: l1.lx + 55, y2: l1.ly + 11 },
        { x1: l2.lx - 55, y1: l2.ly - 11, x2: l2.lx + 55, y2: l2.ly + 11 },
        0,
      ),
    ).toBe(false);

    // Manual drag offset overrides auto corridor smoothly
    const manual = routeObstacleAwareEdge({
      sx: 100,
      sy: 100,
      tx: 400,
      ty: 100,
      preset: 'bezier',
      manualOffset: { dx: 0, dy: -60 },
    });
    expect(manual.ly).toBeLessThan(100);
  });

  test('XState v5 compiler enforces guard switches and records microstep trace', () => {
    const [l1] = buildDemoStudioWebDrafts();
    const machine = l1!.current!;
    const sim = createMachineSimulationSession(machine);

    const uidOf = (name: string): string => machine.states.find((s) => s.name === name)!.uid;
    expect(sim.currentStateUid()).toBe(uidOf('启动与工作区就绪'));

    expect(sim.send('打开主视图或深链').transitioned).toBe(true);
    expect(sim.send('进入规格编辑').transitioned).toBe(true);
    expect(sim.send('打开世界线与对比').transitioned).toBe(true);
    expect(sim.currentStateUid()).toBe(uidOf('世界线与验收闭环'));

    // Guard '门禁全绿' defaults to false -> transition MUST be blocked
    const blocked = sim.send('校验通过保存变更');
    expect(blocked.transitioned).toBe(false);
    expect(sim.currentStateUid()).toBe(uidOf('世界线与验收闭环'));

    // Enable guard -> transition succeeds and appears in trace
    sim.setGuard('门禁全绿', true);
    const allowed = sim.send('校验通过保存变更');
    expect(allowed.transitioned).toBe(true);
    expect(sim.currentStateUid()).toBe(uidOf('写保护与保存变更'));
    expect(sim.getTrace().length).toBe(4);
    sim.stop();
  });

  test('obsidianmd/pele renders Mermaid flowchart synchronously to SVG', () => {
    const res = renderMermaidDiagram(
      'flowchart TD\n  C1["domain-core"] --> C3["web-workbench"]\n  C3 --> C5["forest-tabs"]',
    );
    expect(res.error).toBeNull();
    expect(res.svg).toContain('<svg');
    expect(res.svg).toContain('</svg>');
  });

  test('Axiom 6 production purity: apps/studio/src has zero colorful emoji abuse and zero DEMO-SIM/placeholder UI strings', () => {
    const studioSrc = join(import.meta.dirname, '..', '..', 'apps', 'studio', 'src');
    const files = collectFiles(studioSrc);
    expect(files.length).toBeGreaterThan(5);
    const forbidden =
      /🌿|🤖|✅|🔴|🟡|⛔|📌|\[DEMO-SIM\]|槽位预留|RAG 语义 · 预留|window\.prompt\(/u;
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const m = forbidden.exec(content);
      if (m) violations.push(`${file}: found "${m[0]}"`);
    }
    expect(violations).toEqual([]);
  });

  test('Axiom 5 exclusive domain groups assign every spec at most once with non-overlapping bands', () => {
    const mockSpecs = [
      'change-lifecycle',
      'review-freeze',
      'validation',
      'cli',
      'completion',
      'studio-core',
      'studio-web',
      'config-schema',
      'monorepo-structure',
    ].map((id) => ({
      id,
      title: id,
      file: `llmanspec/specs/${id}.feature`,
      kind: (id === 'studio-web' ? 'machine' : 'doc') as 'machine' | 'doc',
      hardness: 'tested' as const,
      ruleCount: 3,
      scenarioCount: 3,
      decisionTableCount: 0,
      machineKeys: [],
      summary: id,
      reqPreview: [],
      tags: [],
      stale: false,
    }));
    const { groups, ungroupedIds } = buildExclusiveDomainGroups(mockSpecs, new Set());
    expect(groups.length).toBe(4);
    expect(ungroupedIds.length).toBe(0);
    // Exclusive membership: every spec appears in exactly one group
    const seen = new Set<string>();
    for (const g of groups) {
      for (const m of g.memberIds) {
        expect(seen.has(m)).toBe(false);
        seen.add(m);
      }
    }
    expect(seen.size).toBe(mockSpecs.length);

    // Non-overlapping group frames
    const layout = layoutMainViewWithGroups(mockSpecs, groups, ungroupedIds, new Set(), {}, 'map');
    for (let i = 0; i < layout.groupBoxes.length; i += 1) {
      for (let j = i + 1; j < layout.groupBoxes.length; j += 1) {
        const a = layout.groupBoxes[i]!;
        const b = layout.groupBoxes[j]!;
        expect(
          rectsOverlap(
            { x1: a.x, y1: a.y, x2: a.x + a.width, y2: a.y + a.height },
            { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height },
            0,
          ),
        ).toBe(false);
      }
    }
  });
});
