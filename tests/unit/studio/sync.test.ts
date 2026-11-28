import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SYNC_BOTH_BLOCKED_REASON,
  SYNC_SNAPSHOT_LABEL,
  applySyncPicks,
  buildSyncItems,
  cloneMachineIR,
  commentWatchTag,
  computeMachineDiff,
  createMachineDraft,
  createStudioStateDoc,
  hasOpenSyncSnapshot,
  snapshotBeforeSync,
  type MachineDraft,
  type SyncItem,
  type SyncPick,
} from '@llman-sdd/core';

function ir(states: string[], transitions: Array<[string, string, string, string?]>) {
  return createMachineDraft({
    capability: 'order',
    reqId: 'r1',
    ruleTitle: '订单流转',
    scenarioName: '主流程',
    states: states.map((name, i) => ({ name, initial: i === 0 })),
    transitions: transitions.map(([from, event, to, guard]) => ({
      from,
      event,
      to,
      ...(guard !== undefined ? { guard } : {}),
    })),
  }).current!;
}

function modifyDraft(
  baseStates: string[],
  baseTrans: Array<[string, string, string, string?]>,
  ours: StudioMut,
  theirs: StudioMut,
): { draft: MachineDraft; theirsIr: ReturnType<typeof ir>; items: SyncItem[] } {
  const baseline = ir(baseStates, baseTrans);
  const oursIr = ours(cloneMachineIR(baseline));
  const theirsIr = theirs(ir(baseStates, baseTrans));
  const draft: MachineDraft = {
    mode: 'modify',
    baseline,
    current: oursIr,
    sourceFile: 'llmanspec/specs/order.feature',
  };
  return { draft, theirsIr, items: buildSyncItems(draft, theirsIr) };
}

type StudioMut = (m: ReturnType<typeof ir>) => ReturnType<typeof ir>;

function addState(name: string): StudioMut {
  return (m) => {
    const next = cloneMachineIR(m);
    next.states = [...next.states, { uid: `s${String(next.states.length + 1)}`, name }];
    return next;
  };
}

function addEdge(from: string, event: string, to: string, guard?: string): StudioMut {
  return (m) => {
    const next = cloneMachineIR(m);
    const fromUid = next.states.find((s) => s.name === from)?.uid;
    let toUid = next.states.find((s) => s.name === to)?.uid;
    if (toUid === undefined) {
      toUid = `s${String(next.states.length + 1)}`;
      next.states = [...next.states, { uid: toUid, name: to }];
    }
    if (fromUid === undefined) throw new Error(`missing from ${from}`);
    next.transitions = [
      ...next.transitions,
      {
        uid: `e${String(next.transitions.length + 1)}`,
        fromUid,
        event,
        toUid,
        ...(guard !== undefined ? { guard } : {}),
      },
    ];
    return next;
  };
}

function changeGuard(from: string, event: string, guard: string): StudioMut {
  return (m) => {
    const next = cloneMachineIR(m);
    const fromUid = next.states.find((s) => s.name === from)?.uid;
    next.transitions = next.transitions.map((t) =>
      t.fromUid === fromUid && t.event === event ? { ...t, guard } : t,
    );
    return next;
  };
}

describe('studio/sync (r164)', () => {
  const BASE_STATES = ['草稿', '待审', '完成'];
  const BASE_TRANS: Array<[string, string, string, string?]> = [
    ['草稿', '提交', '待审'],
    ['待审', '通过', '完成'],
  ];

  test('ours-only / theirs-only get defaults; identical both-side adds stay off the pick list', () => {
    const { items: oursOnly } = modifyDraft(BASE_STATES, BASE_TRANS, addState('已取消'), (m) => m);
    expect(oursOnly.some((i) => i.kind === 'state' && i.oursStateName === '已取消')).toBe(true);
    expect(oursOnly.find((i) => i.oursStateName === '已取消')?.defaultPick).toBe('ours');

    const { items: theirsOnly } = modifyDraft(
      BASE_STATES,
      BASE_TRANS,
      (m) => m,
      addState('已归档'),
    );
    expect(theirsOnly.find((i) => i.theirsStateName === '已归档')?.defaultPick).toBe('theirs');

    const { items: aligned } = modifyDraft(
      BASE_STATES,
      BASE_TRANS,
      addEdge('待审', '驳回', '草稿'),
      addEdge('待审', '驳回', '草稿'),
    );
    expect(
      aligned.filter((i) => i.labelOurs?.includes('驳回') || i.labelTheirs?.includes('驳回')),
    ).toEqual([]);
  });

  test('applySyncPicks ours keeps canvas; theirs merges disk; legal both keeps two edges', () => {
    const { draft, items, theirsIr } = modifyDraft(
      BASE_STATES,
      BASE_TRANS,
      addEdge('待审', '驳回', '草稿'),
      addEdge('待审', '加急', '完成'),
    );
    void theirsIr;
    const oursItem = items.find((i) => i.oursTransition?.event === '驳回')!;
    const theirsItem = items.find((i) => i.theirsTransition?.event === '加急')!;

    const keepOurs = applySyncPicks(
      draft,
      items,
      { [oursItem.id]: 'ours', [theirsItem.id]: 'ours' },
      '2026-11-28T00:00:00.000Z',
    );
    expect(keepOurs.blocked).toEqual([]);
    expect(keepOurs.draft.current?.transitions.some((t) => t.event === '驳回')).toBe(true);
    expect(keepOurs.draft.current?.transitions.some((t) => t.event === '加急')).toBe(false);

    const takeTheirs = applySyncPicks(
      draft,
      items,
      { [oursItem.id]: 'theirs', [theirsItem.id]: 'theirs' },
      '2026-11-28T00:00:00.000Z',
    );
    expect(takeTheirs.draft.current?.transitions.some((t) => t.event === '驳回')).toBe(false);
    expect(takeTheirs.draft.current?.transitions.some((t) => t.event === '加急')).toBe(true);

    const both = applySyncPicks(
      draft,
      items,
      { [oursItem.id]: 'ours', [theirsItem.id]: 'theirs' },
      '2026-11-28T00:00:00.000Z',
    );
    expect(both.draft.current?.transitions.some((t) => t.event === '驳回')).toBe(true);
    expect(both.draft.current?.transitions.some((t) => t.event === '加急')).toBe(true);

    const bothPick = applySyncPicks(
      draft,
      items,
      { [oursItem.id]: 'both', [theirsItem.id]: 'both' },
      '2026-11-28T00:00:00.000Z',
    );
    expect(bothPick.blocked).toEqual([]);
    expect(bothPick.draft.current?.transitions.some((t) => t.event === '驳回')).toBe(true);
    expect(bothPick.draft.current?.transitions.some((t) => t.event === '加急')).toBe(true);
  });

  test('same (from,event) clash forbids both and leaves a blocked reason', () => {
    const { draft, items } = modifyDraft(
      BASE_STATES,
      BASE_TRANS,
      changeGuard('待审', '通过', '金额<=1000'),
      changeGuard('待审', '通过', '金额<=9000'),
    );
    const clash = items.find((i) => i.kind === 'guard' || (i.oursPresent && i.theirsPresent));
    expect(clash).toBeDefined();
    expect(clash!.defaultPick).toBeNull();
    const picks: Record<string, SyncPick> = { [clash!.id]: 'both' };
    const result = applySyncPicks(draft, items, picks, '2026-11-28T00:00:00.000Z');
    expect(result.blocked).toEqual([{ itemId: clash!.id, reason: SYNC_BOTH_BLOCKED_REASON }]);
  });

  test('snapshotBeforeSync injects clock and is idempotent until closed', () => {
    const created = createMachineDraft({
      capability: 'order',
      reqId: 'r1',
      ruleTitle: '订单流转',
      scenarioName: '主流程',
      states: [{ name: '草稿', initial: true }, { name: '待审' }],
      transitions: [{ from: '草稿', event: '提交', to: '待审' }],
    });
    const key = created.current!.machineKey;
    const draft: MachineDraft = {
      ...created,
      mode: 'modify',
      baseline: cloneMachineIR(created.current!),
    };
    let doc = createStudioStateDoc({
      id: 'sync-demo',
      title: 'sync',
      createdAt: '2026-11-28T00:00:00.000Z',
      drafts: [draft],
    });
    doc = snapshotBeforeSync(doc, key, '2026-11-28T01:00:00.000Z');
    expect(hasOpenSyncSnapshot(doc, key)).toBe(true);
    const firstCount = doc.timelines[key]!.entries.length;
    const label = doc.timelines[key]!.entries.at(-1)?.label;
    expect(label).toBe(SYNC_SNAPSHOT_LABEL);
    expect(doc.timelines[key]!.entries.at(-1)?.createdAt).toBe('2026-11-28T01:00:00.000Z');
    doc = snapshotBeforeSync(doc, key, '2026-11-28T02:00:00.000Z');
    expect(doc.timelines[key]!.entries.length).toBe(firstCount);
  });

  test('commentWatchTag defaults to author', () => {
    expect(
      commentWatchTag({
        id: 'c1',
        anchor: { kind: 'machine', machineKey: 'k' },
        author: 'human',
        body: 'x',
        createdAt: 't',
        status: 'open',
      }),
    ).toBe('human');
    expect(
      commentWatchTag({
        id: 'c1',
        anchor: { kind: 'machine', machineKey: 'k' },
        author: 'human',
        body: 'x',
        createdAt: 't',
        status: 'open',
        watchTag: 'agent',
      }),
    ).toBe('agent');
  });

  test('merged result matches picks against computeMachineDiff and source has zero node:/Date.now', () => {
    const { draft, items } = modifyDraft(
      BASE_STATES,
      BASE_TRANS,
      addState('已取消'),
      addState('已归档'),
    );
    const oursItem = items.find((i) => i.oursStateName === '已取消')!;
    const theirsItem = items.find((i) => i.theirsStateName === '已归档')!;
    const merged = applySyncPicks(
      draft,
      items,
      { [oursItem.id]: 'ours', [theirsItem.id]: 'theirs' },
      '2026-11-28T00:00:00.000Z',
    );
    const names = new Set(merged.draft.current!.states.map((s) => s.name));
    expect(names.has('已取消')).toBe(true);
    expect(names.has('已归档')).toBe(true);
    expect(computeMachineDiff(merged.draft).hasChanges).toBe(true);

    const src = readFileSync(
      join(import.meta.dir, '../../../packages/core/src/studio/sync.ts'),
      'utf8',
    );
    expect(src.includes("from 'node:")).toBe(false);
    expect(src.includes('from "node:')).toBe(false);
    expect(src.includes('Date.now(')).toBe(false);
  });
});
