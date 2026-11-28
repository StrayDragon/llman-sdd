/**
 * Three-way semantic sync items and pick-merge for Studio drafts (studio-core r164).
 * Aligns by state name and transition signature — never line-merges .feature text.
 * Pure: zero I/O, zero wall clock; worldline timestamps come from `nowIso`.
 */
import { computeMachineDiff } from './diff.ts';
import {
  cloneMachineDraft,
  cloneMachineIR,
  nextPrefixedUid,
  type MachineDraft,
  type StudioDocDraft,
  type StudioMachineIR,
  type StudioStateDoc,
  type StudioStateNode,
  type StudioTransitionEdge,
} from './model.ts';
import { recordWorldlineCommit } from './store.ts';

export const SYNC_SNAPSHOT_BRANCH_REF = 'snapshot-before-sync';
export const SYNC_SNAPSHOT_LABEL = '刚才在画布上的版本';
export const SYNC_BOTH_BLOCKED_REASON = 'signature-clash';

export type SyncItemKind = 'state' | 'transition' | 'guard' | 'doc-rule';
export type SyncPick = 'ours' | 'theirs' | 'both';

export interface SyncTransitionPayload {
  from: string;
  event: string;
  guard?: string;
  to: string;
}

export interface SyncItem {
  id: string;
  kind: SyncItemKind;
  machineKey?: string;
  sourceFile: string;
  oursPresent: boolean;
  theirsPresent: boolean;
  labelOurs: string | null;
  labelTheirs: string | null;
  defaultPick: SyncPick | null;
  oursStateName?: string;
  theirsStateName?: string;
  oursTransition?: SyncTransitionPayload;
  theirsTransition?: SyncTransitionPayload;
  oursText?: string;
  theirsText?: string;
}

export interface ApplySyncPicksResult {
  draft: MachineDraft;
  applied: string[];
  blocked: Array<{ itemId: string; reason: string }>;
}

export interface ApplyDocSyncPicksResult {
  docDraft: StudioDocDraft;
  applied: string[];
  blocked: Array<{ itemId: string; reason: string }>;
}

function stateNameOf(ir: StudioMachineIR, uid: string): string {
  return ir.states.find((s) => s.uid === uid)?.name ?? uid;
}

function transitionPayload(ir: StudioMachineIR, edge: StudioTransitionEdge): SyncTransitionPayload {
  const payload: SyncTransitionPayload = {
    from: stateNameOf(ir, edge.fromUid),
    event: edge.event.trim(),
    to: stateNameOf(ir, edge.toUid),
  };
  const guard = (edge.guard ?? '').trim();
  if (guard !== '') payload.guard = guard;
  return payload;
}

function transitionSig(p: SyncTransitionPayload): string {
  return `${p.from}\0${p.event}\0${p.guard ?? ''}\0${p.to}`;
}

function pairKey(p: SyncTransitionPayload): string {
  return `${p.from}\0${p.event}`;
}

function formatTransition(p: SyncTransitionPayload): string {
  const guardPart = p.guard ? ` [${p.guard}]` : '';
  return `${p.from} --[${p.event}${guardPart}]--> ${p.to}`;
}

function stateSet(ir: StudioMachineIR | null): Set<string> {
  return new Set((ir?.states ?? []).map((s) => s.name));
}

function transitionMap(ir: StudioMachineIR | null): Map<string, SyncTransitionPayload> {
  const map = new Map<string, SyncTransitionPayload>();
  if (!ir) return map;
  for (const edge of ir.transitions) {
    const payload = transitionPayload(ir, edge);
    map.set(transitionSig(payload), payload);
  }
  return map;
}

function itemId(machineKey: string, kind: SyncItemKind, key: string): string {
  return `${machineKey}/${kind}/${key}`;
}

/**
 * Build pick-list items from BASE (session baseline), OURS (canvas current), THEIRS (reparsed disk).
 * Same-signature adds/removes on both sides are treated as already aligned and omitted.
 */
export function buildSyncItems(draft: MachineDraft, theirs: StudioMachineIR | null): SyncItem[] {
  const base = draft.baseline;
  const ours = draft.current;
  const machineKey = ours?.machineKey ?? base?.machineKey ?? theirs?.machineKey ?? draft.sourceFile;
  const sourceFile = draft.sourceFile;
  const items: SyncItem[] = [];

  const baseStates = stateSet(base);
  const oursStates = stateSet(ours);
  const theirsStates = stateSet(theirs);
  const allStates = new Set([...baseStates, ...oursStates, ...theirsStates]);

  for (const name of allStates) {
    const inBase = baseStates.has(name);
    const inOurs = oursStates.has(name);
    const inTheirs = theirsStates.has(name);
    if (inOurs === inTheirs && inOurs === inBase) continue;
    if (inOurs === inTheirs && inOurs !== inBase) continue;

    const oursPresent = inOurs !== inBase ? inOurs : inOurs && !inTheirs;
    const theirsPresent = inTheirs !== inBase ? inTheirs : inTheirs && !inOurs;
    if (!oursPresent && !theirsPresent) continue;
    if (oursPresent && theirsPresent && inOurs === inTheirs) continue;

    let defaultPick: SyncPick | null = null;
    if (oursPresent && !theirsPresent) defaultPick = 'ours';
    else if (!oursPresent && theirsPresent) defaultPick = 'theirs';

    const labelOurs = oursPresent ? (inOurs ? `状态「${name}」` : `去掉状态「${name}」`) : null;
    const labelTheirs = theirsPresent
      ? inTheirs
        ? `状态「${name}」`
        : `去掉状态「${name}」`
      : null;

    items.push({
      id: itemId(machineKey, 'state', name),
      kind: 'state',
      machineKey,
      sourceFile,
      oursPresent,
      theirsPresent,
      labelOurs,
      labelTheirs,
      defaultPick,
      ...(inOurs ? { oursStateName: name } : {}),
      ...(inTheirs ? { theirsStateName: name } : {}),
    });
  }

  const baseTrans = transitionMap(base);
  const oursTrans = transitionMap(ours);
  const theirsTrans = transitionMap(theirs);
  const consumed = new Set<string>();

  const oursAdded = [...oursTrans.entries()].filter(([sig]) => !baseTrans.has(sig));
  const theirsAdded = [...theirsTrans.entries()].filter(([sig]) => !baseTrans.has(sig));
  const oursRemoved = [...baseTrans.entries()].filter(([sig]) => !oursTrans.has(sig));
  const theirsRemoved = [...baseTrans.entries()].filter(([sig]) => !theirsTrans.has(sig));

  for (const [sig, payload] of oursAdded) {
    if (theirsTrans.has(sig) && !baseTrans.has(sig)) {
      consumed.add(sig);
      continue;
    }
    const theirsSamePair = theirsAdded.find(
      ([tsig, tp]) => !consumed.has(tsig) && pairKey(tp) === pairKey(payload) && tsig !== sig,
    );
    if (theirsSamePair) {
      const [tsig, tpayload] = theirsSamePair;
      consumed.add(sig);
      consumed.add(tsig);
      const onlyGuard =
        payload.from === tpayload.from &&
        payload.event === tpayload.event &&
        payload.to === tpayload.to &&
        (payload.guard ?? '') !== (tpayload.guard ?? '');
      items.push({
        id: itemId(machineKey, onlyGuard ? 'guard' : 'transition', pairKey(payload)),
        kind: onlyGuard ? 'guard' : 'transition',
        machineKey,
        sourceFile,
        oursPresent: true,
        theirsPresent: true,
        labelOurs: formatTransition(payload),
        labelTheirs: formatTransition(tpayload),
        defaultPick: null,
        oursTransition: payload,
        theirsTransition: tpayload,
      });
      continue;
    }
    items.push({
      id: itemId(machineKey, 'transition', `ours+${sig}`),
      kind: 'transition',
      machineKey,
      sourceFile,
      oursPresent: true,
      theirsPresent: false,
      labelOurs: formatTransition(payload),
      labelTheirs: null,
      defaultPick: 'ours',
      oursTransition: payload,
    });
  }

  for (const [sig, payload] of theirsAdded) {
    if (consumed.has(sig) || oursTrans.has(sig)) continue;
    items.push({
      id: itemId(machineKey, 'transition', `theirs+${sig}`),
      kind: 'transition',
      machineKey,
      sourceFile,
      oursPresent: false,
      theirsPresent: true,
      labelOurs: null,
      labelTheirs: formatTransition(payload),
      defaultPick: 'theirs',
      theirsTransition: payload,
    });
  }

  for (const [sig, payload] of oursRemoved) {
    if (!theirsTrans.has(sig) && baseTrans.has(sig)) continue;
    if (!theirsTrans.has(sig)) continue;
    items.push({
      id: itemId(machineKey, 'transition', `ours-${sig}`),
      kind: 'transition',
      machineKey,
      sourceFile,
      oursPresent: true,
      theirsPresent: false,
      labelOurs: `去掉 ${formatTransition(payload)}`,
      labelTheirs: null,
      defaultPick: 'ours',
      oursTransition: payload,
    });
  }

  for (const [sig, payload] of theirsRemoved) {
    if (!oursTrans.has(sig)) continue;
    items.push({
      id: itemId(machineKey, 'transition', `theirs-${sig}`),
      kind: 'transition',
      machineKey,
      sourceFile,
      oursPresent: false,
      theirsPresent: true,
      labelOurs: null,
      labelTheirs: `去掉 ${formatTransition(payload)}`,
      defaultPick: 'theirs',
      theirsTransition: payload,
    });
  }

  return items;
}

export function buildDocSyncItems(
  sourceFile: string,
  oursText: string,
  theirsText: string,
): SyncItem[] {
  if (oursText === theirsText) return [];
  return [
    {
      id: `doc/${sourceFile}`,
      kind: 'doc-rule',
      sourceFile,
      oursPresent: true,
      theirsPresent: true,
      labelOurs: '你在本画布改的正文',
      labelTheirs: '文件里新来的正文',
      defaultPick: null,
      oursText,
      theirsText,
    },
  ];
}

function ensureState(machine: StudioMachineIR, name: string): string {
  const existing = machine.states.find((s) => s.name === name);
  if (existing) return existing.uid;
  const uid = nextPrefixedUid(
    's',
    machine.states.map((s) => s.uid),
  );
  const created: StudioStateNode = { uid, name };
  machine.states = [...machine.states, created];
  if (machine.initialStateUid === null) machine.initialStateUid = uid;
  return uid;
}

function addTransition(machine: StudioMachineIR, payload: SyncTransitionPayload): void {
  const fromUid = ensureState(machine, payload.from);
  const toUid = ensureState(machine, payload.to);
  const already = machine.transitions.some((e) => {
    const cur = transitionPayload(machine, e);
    return transitionSig(cur) === transitionSig(payload);
  });
  if (already) return;
  const uid = nextPrefixedUid(
    'e',
    machine.transitions.map((t) => t.uid),
  );
  const edge: StudioTransitionEdge = {
    uid,
    fromUid,
    event: payload.event,
    toUid,
    ...(payload.guard !== undefined && payload.guard !== '' ? { guard: payload.guard } : {}),
  };
  machine.transitions = [...machine.transitions, edge];
}

function removeStateByName(machine: StudioMachineIR, name: string): void {
  const target = machine.states.find((s) => s.name === name);
  if (!target) return;
  machine.states = machine.states.filter((s) => s.uid !== target.uid);
  machine.transitions = machine.transitions.filter(
    (t) => t.fromUid !== target.uid && t.toUid !== target.uid,
  );
  if (machine.initialStateUid === target.uid) {
    machine.initialStateUid = machine.states[0]?.uid ?? null;
  }
}

function removeTransition(machine: StudioMachineIR, payload: SyncTransitionPayload): void {
  machine.transitions = machine.transitions.filter((e) => {
    return transitionSig(transitionPayload(machine, e)) !== transitionSig(payload);
  });
}

function isRemovalLabel(label: string | null): boolean {
  return label !== null && label.startsWith('去掉');
}

function clashBoth(item: SyncItem): boolean {
  return (
    item.oursPresent &&
    item.theirsPresent &&
    item.kind !== 'doc-rule' &&
    item.oursTransition !== undefined &&
    item.theirsTransition !== undefined &&
    pairKey(item.oursTransition) === pairKey(item.theirsTransition)
  );
}

export function applySyncPicks(
  draft: MachineDraft,
  items: readonly SyncItem[],
  picks: Readonly<Record<string, SyncPick>>,
  _nowIso: string,
): ApplySyncPicksResult {
  const next = cloneMachineDraft(draft);
  if (next.current === null) {
    return { draft: next, applied: [], blocked: [] };
  }
  const machine = cloneMachineIR(next.current);
  const applied: string[] = [];
  const blocked: Array<{ itemId: string; reason: string }> = [];

  for (const item of items) {
    const pick = picks[item.id];
    if (pick === undefined) continue;
    if (pick === 'both' && clashBoth(item)) {
      blocked.push({ itemId: item.id, reason: SYNC_BOTH_BLOCKED_REASON });
      continue;
    }

    if (item.kind === 'state') {
      const name = item.oursStateName ?? item.theirsStateName;
      if (name === undefined) continue;
      if (pick === 'ours') {
        if (item.theirsPresent && !item.oursPresent && isRemovalLabel(item.labelTheirs)) {
          /* keep ours: do not remove */
        } else if (item.theirsPresent && !item.oursPresent) {
          /* theirs-only add, keep ours: do not add */
        }
      } else if (pick === 'theirs') {
        if (item.theirsPresent && isRemovalLabel(item.labelTheirs)) {
          removeStateByName(machine, name);
        } else if (item.theirsPresent) {
          ensureState(machine, name);
        } else if (item.oursPresent && !isRemovalLabel(item.labelOurs)) {
          removeStateByName(machine, name);
        }
      } else if (pick === 'both') {
        if (item.oursStateName) ensureState(machine, item.oursStateName);
        if (item.theirsStateName) ensureState(machine, item.theirsStateName);
      }
      applied.push(item.id);
      continue;
    }

    if (item.kind === 'transition' || item.kind === 'guard') {
      if (pick === 'ours') {
        /* canvas already has ours; drop theirs-only additions */
        if (item.theirsTransition && !item.oursTransition && !isRemovalLabel(item.labelTheirs)) {
          /* do not add */
        }
        if (item.theirsTransition && isRemovalLabel(item.labelTheirs)) {
          /* keep ours: do not remove */
        }
      } else if (pick === 'theirs') {
        if (item.oursTransition && !item.theirsTransition && !isRemovalLabel(item.labelOurs)) {
          removeTransition(machine, item.oursTransition);
        }
        if (item.theirsTransition && isRemovalLabel(item.labelTheirs)) {
          removeTransition(machine, item.theirsTransition);
        } else if (item.theirsTransition) {
          if (item.oursTransition && clashBoth(item)) {
            removeTransition(machine, item.oursTransition);
          }
          addTransition(machine, item.theirsTransition);
        }
      } else if (pick === 'both') {
        if (item.oursTransition && !isRemovalLabel(item.labelOurs)) {
          addTransition(machine, item.oursTransition);
        }
        if (item.theirsTransition && !isRemovalLabel(item.labelTheirs)) {
          addTransition(machine, item.theirsTransition);
        }
      }
      applied.push(item.id);
    }
  }

  next.current = machine;
  return { draft: next, applied, blocked };
}

export function applyDocSyncPicks(
  docDraft: StudioDocDraft,
  items: readonly SyncItem[],
  picks: Readonly<Record<string, SyncPick>>,
): ApplyDocSyncPicksResult {
  let next: StudioDocDraft = { ...docDraft };
  const applied: string[] = [];
  const blocked: Array<{ itemId: string; reason: string }> = [];
  for (const item of items) {
    if (item.kind !== 'doc-rule') continue;
    const pick = picks[item.id];
    if (pick === undefined) continue;
    if (pick === 'both') {
      blocked.push({ itemId: item.id, reason: SYNC_BOTH_BLOCKED_REASON });
      continue;
    }
    if (pick === 'theirs' && item.theirsText !== undefined) {
      next = { ...next, currentText: item.theirsText };
    }
    applied.push(item.id);
  }
  return { docDraft: next, applied, blocked };
}

export function hasOpenSyncSnapshot(doc: StudioStateDoc, machineKey: string): boolean {
  const openId = doc.syncOpen?.[machineKey];
  if (openId === undefined) return false;
  const tl = doc.timelines[machineKey];
  return tl?.entries.some((e) => e.id === openId) === true;
}

export function snapshotBeforeSync(
  doc: StudioStateDoc,
  machineKey: string,
  nowIso: string,
): StudioStateDoc {
  if (hasOpenSyncSnapshot(doc, machineKey)) return doc;
  const current = doc.machines[machineKey]?.current ?? null;
  const snapped = recordWorldlineCommit(doc, machineKey, current, {
    label: SYNC_SNAPSHOT_LABEL,
    createdAt: nowIso,
    actor: 'human',
    branchRef: SYNC_SNAPSHOT_BRANCH_REF,
  });
  const tl = snapped.timelines[machineKey];
  const snapshotId = tl?.entries.at(-1)?.id;
  if (snapshotId === undefined) return snapped;
  return {
    ...snapped,
    syncOpen: { ...snapped.syncOpen, [machineKey]: snapshotId },
  };
}

export function closeSyncSnapshot(doc: StudioStateDoc, machineKey: string): StudioStateDoc {
  if (doc.syncOpen === undefined || doc.syncOpen[machineKey] === undefined) return doc;
  const next = { ...doc.syncOpen };
  delete next[machineKey];
  return { ...doc, syncOpen: Object.keys(next).length > 0 ? next : undefined };
}

export function picksMatchDiff(
  before: MachineDraft,
  after: MachineDraft,
  items: readonly SyncItem[],
  picks: Readonly<Record<string, SyncPick>>,
): boolean {
  const afterDiff = computeMachineDiff(after);
  const theirsNames = new Set(
    items
      .filter((i) => picks[i.id] === 'theirs' && i.theirsStateName)
      .map((i) => i.theirsStateName!),
  );
  for (const name of theirsNames) {
    if (!after.current?.states.some((s) => s.name === name)) return false;
  }
  const droppedOurs = items.filter(
    (i) => picks[i.id] === 'theirs' && i.oursPresent && !i.theirsPresent && i.oursStateName,
  );
  for (const item of droppedOurs) {
    if (after.current?.states.some((s) => s.name === item.oursStateName)) return false;
  }
  void before;
  void afterDiff;
  return true;
}
