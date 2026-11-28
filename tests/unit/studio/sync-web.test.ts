import { describe, expect, test } from 'bun:test';

import { foldActivityItems } from '../../../apps/studio/src/sync/activity.ts';
import {
  activityBadgeLabel,
  copyContainsForbidden,
  pickTopHudSlot,
  SYNC_COPY,
  syncSideCaption,
} from '../../../apps/studio/src/sync/copy.ts';
import {
  syncItemAllowsKeepBoth,
  syncItemIsExclusivePick,
} from '../../../apps/studio/src/sync/overlay.ts';

describe('studio sync web copy & HUD (r165, r166)', () => {
  test('production copy table contains none of the forbidden jargon', () => {
    for (const value of Object.values(SYNC_COPY)) {
      expect(copyContainsForbidden(value)).toBeNull();
    }
    expect(copyContainsForbidden(activityBadgeLabel(2))).toBeNull();
    expect(activityBadgeLabel(2)).toBe('还有人在改 · 2');
  });

  test('file-sync copy uses canvas-side wording and no jargon', () => {
    expect(SYNC_COPY.yours).toBe('你在本画布的调整');
    expect(SYNC_COPY.incoming).toBe('文件里新来的');
    expect(syncSideCaption('状态「已取消」')).toBe('已取消');
    expect(syncSideCaption(null)).toBe('没有');
  });

  test('file-sync does not steal the top HUD slot from compare', () => {
    expect(
      pickTopHudSlot({
        syncOpen: true,
        worldlineComparing: true,
        hasDrift: true,
        simulating: true,
        showTips: true,
      }),
    ).toBe('worldline-compare');
    expect(
      pickTopHudSlot({
        syncOpen: true,
        worldlineComparing: false,
        hasDrift: false,
        simulating: false,
        showTips: false,
      }),
    ).toBeNull();
  });

  test('activity fold uses vernacular labels and drops self echo', () => {
    const items = foldActivityItems({
      events: [
        {
          type: 'state-updated',
          wsKey: 'peer@main@root',
          stateId: 'workspace-draft',
          revision: 3,
          originClientId: 'self',
        },
        {
          type: 'state-updated',
          wsKey: 'peer@main@root',
          stateId: 'workspace-draft',
          revision: 4,
          originClientId: 'other',
        },
      ],
      selfClientId: 'self',
      activeWsKey: 'here@main@root',
      comments: [
        {
          id: 'c1',
          anchor: { kind: 'edge', machineKey: 'm', edgeUid: 'e1' },
          author: 'agent',
          body: '看法',
          createdAt: 't',
          status: 'open',
        },
      ],
      revisions: [
        {
          id: 'r1',
          machineKey: 'm',
          author: 'agent',
          source: 'drift-trace',
          rationale: 'x',
          ops: [],
          createdAt: 't',
          status: 'pending',
        },
      ],
    });
    expect(items.some((i) => i.id.includes('revision:3'))).toBe(false);
    expect(items.some((i) => i.kind === 'peer-save')).toBe(true);
    expect(items.some((i) => i.kind === 'agent-comment')).toBe(true);
    expect(items.some((i) => i.kind === 'drift')).toBe(true);
    for (const item of items) {
      expect(copyContainsForbidden(item.label)).toBeNull();
    }
  });

  test('activity fold counts disk comments without waiting for events', () => {
    const items = foldActivityItems({
      events: [],
      selfClientId: 'self',
      activeWsKey: 'here@main@root',
      comments: [
        {
          id: 'c1',
          anchor: { kind: 'edge', machineKey: 'm', edgeUid: 'e1' },
          author: 'agent',
          body: '看法',
          createdAt: 't',
          status: 'open',
        },
      ],
      revisions: [
        {
          id: 'r1',
          machineKey: 'm',
          author: 'agent',
          source: 'drift-trace',
          rationale: 'x',
          ops: [],
          createdAt: 't',
          status: 'pending',
        },
      ],
    });
    expect(items.some((i) => i.kind === 'agent-comment')).toBe(true);
    expect(items.some((i) => i.kind === 'drift')).toBe(true);
  });

  test('signature-clash items are exclusive; keep-both only for two-sided states', () => {
    expect(
      syncItemIsExclusivePick({
        id: 't',
        kind: 'guard',
        sourceFile: 'f',
        oursPresent: true,
        theirsPresent: true,
        labelOurs: 'a',
        labelTheirs: 'b',
        defaultPick: null,
        oursTransition: { from: '待审', event: '通过', to: '完成', guard: 'x' },
        theirsTransition: { from: '待审', event: '通过', to: '完成', guard: 'y' },
      }),
    ).toBe(true);
    expect(
      syncItemAllowsKeepBoth({
        id: 't',
        kind: 'guard',
        sourceFile: 'f',
        oursPresent: true,
        theirsPresent: true,
        labelOurs: 'a',
        labelTheirs: 'b',
        defaultPick: null,
      }),
    ).toBe(false);
    expect(
      syncItemAllowsKeepBoth({
        id: 's',
        kind: 'state',
        sourceFile: 'f',
        oursPresent: true,
        theirsPresent: true,
        labelOurs: '挂起',
        labelTheirs: '挂起',
        defaultPick: null,
        oursStateName: '挂起',
        theirsStateName: '挂起',
      }),
    ).toBe(true);
  });
});
