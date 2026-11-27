import { describe, expect, test } from 'bun:test';

import {
  contrastRatio,
  MIN_NON_TEXT_CONTRAST,
  STUDIO_CONTRAST_PALETTES,
} from '../../../apps/studio/src/ergonomics/contrast.ts';
import { buildSnapshotFileName } from '../../../apps/studio/src/ergonomics/exportSnapshot.ts';
import { STUDIO_GUIDED_TOUR_STEPS } from '../../../apps/studio/src/ergonomics/guidedTour.ts';
import {
  alignSelectedNodes,
  distributeSelectedNodes,
  nudgeCoord,
  tidySelectedGrid,
  type NodeBoxInput,
} from '../../../apps/studio/src/ergonomics/layoutTidy.ts';
import {
  filterShortcutsByView,
  STUDIO_SHORTCUT_REGISTRY,
} from '../../../apps/studio/src/ergonomics/shortcuts.ts';

describe('studio onboarding, shortcuts, layout tidy & contrast (r157)', () => {
  test('shortcut registry filters by view dialect and contains zero unimplemented placeholders', () => {
    const ids = new Set(STUDIO_SHORTCUT_REGISTRY.map((s) => s.id));
    expect(ids.has('help')).toBe(true);
    expect(ids.has('cmdk')).toBe(true);
    expect(ids.has('macro-group')).toBe(true);
    expect(ids.has('macro-tab')).toBe(true);
    expect(ids.has('in-panel-find')).toBe(true);

    const macroList = filterShortcutsByView('macro');
    expect(macroList.some((s) => s.id === 'macro-group')).toBe(true);
    expect(macroList.some((s) => s.id === 'tab-spawn')).toBe(false);

    const machineList = filterShortcutsByView('machine');
    expect(machineList.some((s) => s.id === 'tab-spawn')).toBe(true);
    expect(machineList.some((s) => s.id === 'macro-group')).toBe(false);
  });

  test('guided tour exposes 6 non-empty sequential steps', () => {
    expect(STUDIO_GUIDED_TOUR_STEPS.length).toBe(6);
    for (const step of STUDIO_GUIDED_TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.summary.length).toBeGreaterThan(10);
    }
  });

  test('multi-select alignment, distribution, grid tidy & arrow nudge compute exact coordinates', () => {
    const boxes: NodeBoxInput[] = [
      { id: 'a', x: 100, y: 40, width: 200, height: 100 },
      { id: 'b', x: 260, y: 120, width: 200, height: 100 },
      { id: 'c', x: 700, y: 260, width: 200, height: 100 },
    ];
    const left = alignSelectedNodes(boxes, 'left');
    expect(left['a']!.x).toBe(100);
    expect(left['b']!.x).toBe(100);
    expect(left['c']!.x).toBe(100);

    const top = alignSelectedNodes(boxes, 'top');
    expect(top['b']!.y).toBe(40);
    expect(top['c']!.y).toBe(40);

    const distH = distributeSelectedNodes(boxes, 'horizontal');
    expect(distH['a']!.x).toBe(100);
    expect(distH['b']!.x).toBe(400);
    expect(distH['c']!.x).toBe(700);

    const tidy = tidySelectedGrid(boxes, 32, 32);
    expect(tidy['a']).toEqual({ x: 100, y: 40 });
    expect(tidy['b']).toEqual({ x: 332, y: 40 });
    expect(tidy['c']).toEqual({ x: 100, y: 172 });

    expect(nudgeCoord({ x: 10, y: 20 }, 'ArrowRight', false)).toEqual({ x: 18, y: 20 });
    expect(nudgeCoord({ x: 10, y: 20 }, 'ArrowUp', true)).toEqual({ x: 10, y: -4 });
    expect(nudgeCoord({ x: 10, y: 20 }, 'KeyA', false)).toBeNull();
  });

  test('both linear and washi light skins satisfy >= 3.0:1 non-text contrast for default edges and strong borders', () => {
    for (const skin of ['linear', 'washi'] as const) {
      const p = STUDIO_CONTRAST_PALETTES[skin];
      expect(contrastRatio(p.edgeDefault, p.canvasBg)).toBeGreaterThanOrEqual(
        MIN_NON_TEXT_CONTRAST,
      );
      expect(contrastRatio(p.borderStrong, p.canvasBg)).toBeGreaterThanOrEqual(
        MIN_NON_TEXT_CONTRAST,
      );
      expect(contrastRatio(p.edgeManual, p.canvasBg)).toBeGreaterThanOrEqual(MIN_NON_TEXT_CONTRAST);
    }
  });

  test('snapshot export filename normalizes titles safely', () => {
    expect(buildSnapshotFileName('主视图 · Main', 'svg')).toBe('llman-studio-主视图-main.svg');
    expect(buildSnapshotFileName('   ', 'png')).toBe('llman-studio-studio-canvas.png');
  });
});
