import { describe, expect, test } from 'bun:test';

import {
  formatStudioDeepLinkQuery,
  nestLevelLabel,
  nestPathFromStack,
  nestStackFromPath,
  parseStudioDeepLink,
  studioDeepLinkJsonSchema,
  studioFocusContextSchema,
  type MachineDraft,
  type StudioMachineIR,
} from '@llman-sdd/core';

import { renderNegotiatedMarkdown } from '../../../apps/cli/src/studio-server/negotiate.ts';
import {
  getParentNestContext,
  nestBreadcrumb,
} from '../../../apps/studio/src/nest/parentContext.ts';
import {
  buildSubtreeDiffText,
  getSubtreeMachineIds,
} from '../../../apps/studio/src/nest/subtree.ts';

function ir(
  key: string,
  states: Array<{ uid: string; name: string; sub?: string }>,
  transitions: Array<{ uid: string; from: string; event: string; to: string; guard?: string }>,
): StudioMachineIR {
  return {
    machineKey: key,
    capability: key.split('/')[0] ?? key,
    reqId: 'r1',
    ruleTitle: key,
    scenarioName: 'main',
    initialStateUid: states[0]?.uid ?? null,
    columns: { from: 'from', event: 'event', to: 'to' },
    states: states.map((s) => ({
      uid: s.uid,
      name: s.name,
      ...(s.sub ? { subMachineKey: s.sub } : {}),
    })),
    transitions: transitions.map((t) => ({
      uid: t.uid,
      fromUid: t.from,
      event: t.event,
      toUid: t.to,
      ...(t.guard ? { guard: t.guard } : {}),
    })),
  };
}

function draftOf(machine: StudioMachineIR, dirty = false): MachineDraft {
  const next = dirty
    ? {
        ...machine,
        states: [...machine.states, { uid: 'sx', name: 'extra' }],
      }
    : machine;
  return {
    mode: 'modify',
    baseline: machine,
    current: next,
    sourceFile: `${machine.capability}.feature`,
  };
}

describe('nest subtree and parent context', () => {
  test('C1: A→B→A cycle terminates without duplicating ids', () => {
    const a = ir('A', [{ uid: 'sa', name: 'ha', sub: 'B' }], []);
    const b = ir('B', [{ uid: 'sb', name: 'hb', sub: 'A' }], []);
    const machines = { A: a, B: b };
    const ids = getSubtreeMachineIds('A', (k) => machines[k as 'A' | 'B']);
    expect(ids).toEqual(['A', 'B']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('C1: DAG shared child yields distinct breadcrumbs and parent neighbors', () => {
    const child = ir(
      'child/r1/c',
      [
        { uid: 'c1', name: 'c-in' },
        { uid: 'c2', name: 'c-out' },
      ],
      [{ uid: 'te', from: 'c1', event: 'go', to: 'c2' }],
    );
    const hostA = ir(
      'hostA/r1/a',
      [
        { uid: 'a0', name: 'a-in' },
        { uid: 'ah', name: 'a-host', sub: 'child/r1/c' },
        { uid: 'a1', name: 'a-out' },
      ],
      [
        { uid: 'ae1', from: 'a0', event: 'enter', to: 'ah' },
        { uid: 'ae2', from: 'ah', event: 'leave', to: 'a1', guard: 'ok' },
      ],
    );
    const hostB = ir(
      'hostB/r1/b',
      [
        { uid: 'b0', name: 'b-in' },
        { uid: 'bh', name: 'b-host', sub: 'child/r1/c' },
        { uid: 'b1', name: 'b-out' },
      ],
      [
        { uid: 'be1', from: 'b0', event: 'in', to: 'bh' },
        { uid: 'be2', from: 'bh', event: 'out', to: 'b1' },
      ],
    );
    const resolve = (k: string) =>
      k === hostA.machineKey
        ? hostA
        : k === hostB.machineKey
          ? hostB
          : k === child.machineKey
            ? child
            : null;

    const pathA = [{ machineKey: child.machineKey, label: 'child' }];
    const pathB = [{ machineKey: child.machineKey, label: 'child' }];
    const ctxA = getParentNestContext(pathA, hostA.machineKey, 'hostA', resolve);
    const ctxB = getParentNestContext(pathB, hostB.machineKey, 'hostB', resolve);
    expect(ctxA?.hostName).toBe('a-host');
    expect(ctxB?.hostName).toBe('b-host');
    expect(ctxA?.incoming.map((n) => n.name)).toEqual(['a-in']);
    expect(ctxB?.incoming.map((n) => n.name)).toEqual(['b-in']);
    expect(ctxA?.outgoing[0]?.edgeLabel).toBe('leave [ok]');
    const crumbsA = nestBreadcrumb(hostA.machineKey, 'hostA', pathA).map((c) => c.label);
    const crumbsB = nestBreadcrumb(hostB.machineKey, 'hostB', pathB).map((c) => c.label);
    expect(crumbsA).toEqual(['hostA', 'child']);
    expect(crumbsB).toEqual(['hostB', 'child']);
    expect(crumbsA).not.toEqual(crumbsB);
  });

  test('subtree diff uses layered headers', () => {
    const child = ir('child/r1/c', [{ uid: 'c1', name: 'c' }], []);
    const host = ir('host/r1/h', [{ uid: 'h1', name: 'h', sub: 'child/r1/c' }], []);
    const drafts = {
      [host.machineKey]: draftOf(host, false),
      [child.machineKey]: draftOf(child, true),
    };
    const text = buildSubtreeDiffText(host.machineKey, drafts);
    expect(text).toContain('# [子层: child/r1/c]');
  });
});

describe('deep link parse/format', () => {
  test('C5: kind/target without nest/focus round-trips', () => {
    const raw = 'kind=machine&target=studio-web/r143/Studio%20Web%20主态流转';
    const parsed = parseStudioDeepLink(raw);
    expect(parsed.kind).toBe('machine');
    expect(parsed.target).toContain('studio-web');
    expect(parsed.nest).toEqual([]);
    expect(parsed.focus).toBeNull();
    const again = parseStudioDeepLink(formatStudioDeepLinkQuery(parsed));
    expect(again.kind).toBe(parsed.kind);
    expect(again.target).toBe(parsed.target);
    expect(again.nest).toEqual([]);
    expect(again.focus).toBeNull();
  });

  test('nest path and macro-edge focus parse from query and hash', () => {
    const q = parseStudioDeepLink('kind=machine&target=k0&nest=k0,k1,k2&focus=macro-edge:ref_1');
    expect(q.nest).toEqual(['k0', 'k1', 'k2']);
    expect(q.focus).toEqual({ kind: 'macro-edge', id: 'ref_1' });
    expect(nestLevelLabel(nestStackFromPath(q.nest).length)).toBe('L3');
    expect(nestPathFromStack('k0', nestStackFromPath(q.nest))).toEqual(['k0', 'k1', 'k2']);
    const hashed = parseStudioDeepLink('', '#tab=m:k0&nest=k0,k1,k2&focus=macro-edge:ref_1');
    expect(hashed.kind).toBe('machine');
    expect(hashed.target).toBe('k0');
    expect(hashed.nest).toEqual(['k0', 'k1', 'k2']);
    expect(hashed.focus?.kind).toBe('macro-edge');
  });

  test('C4: markdown lists nest and json matches studioFocusContextSchema', () => {
    const focus = studioFocusContextSchema.parse({
      wsKey: 'ws',
      repo: 'repo',
      branch: 'main',
      targetKind: 'machine',
      targetId: 'k0',
      canonicalUrl: 'http://127.0.0.1:4710/p/ws?kind=machine&target=k0&nest=k0,k1',
      summary: 'repo (main) · 1 specs',
      nest: ['k0', 'k1'],
      focus: { kind: 'macro-edge', id: 'ref_1' },
    });
    const md = renderNegotiatedMarkdown({
      workspace: {
        wsKey: 'ws',
        repo: 'repo',
        branch: 'main',
        worktreePath: '/tmp',
        instanceRoot: '/tmp',
        instanceRel: '.',
        protected: false,
        specCount: 1,
      },
      focus,
      specs: [],
      openCommentCount: 0,
      baseUrl: 'http://127.0.0.1:4710',
    });
    expect(md).toContain('Nest: `k0 > k1`');
    expect(md).toContain('Focus object: `macro-edge:ref_1`');
    const json = studioDeepLinkJsonSchema.parse({
      focus,
      workspace: {
        wsKey: 'ws',
        repo: 'repo',
        branch: 'main',
        worktreePath: '/tmp',
        instanceRoot: '/tmp',
        instanceRel: '.',
        protected: false,
        specCount: 1,
      },
      specs: [],
      edges: [],
    });
    expect(json.focus.nest).toEqual(['k0', 'k1']);
  });
});
