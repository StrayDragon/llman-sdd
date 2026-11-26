import { describe, expect, test } from 'bun:test';

import {
  STUDIO_LINTER_RULES,
  createMachineDraft,
  hasBlockingDiagnostics,
  parseCapability,
  validateAllSpecs,
  validateMachineGraph,
  type StudioMachineIR,
} from '@llman-sdd/core';

function makeMachine(
  states: Array<{ uid: string; name: string }>,
  transitions: Array<{
    uid: string;
    fromUid: string;
    event: string;
    guard?: string;
    toUid: string;
  }>,
  initialStateUid: string | null = states[0]?.uid ?? null,
): StudioMachineIR {
  return {
    machineKey: 'test/r1/sample',
    capability: 'test',
    reqId: 'r1',
    ruleTitle: 'Sample rule',
    scenarioName: 'sample',
    initialStateUid,
    columns: { from: 'from', event: 'event', to: 'to' },
    states,
    transitions,
  };
}

describe('studio/validate (r129)', () => {
  test('exposes extensible rule metadata for E1-E4 and W1-W2', () => {
    expect(STUDIO_LINTER_RULES.map((r) => r.code)).toEqual(['E1', 'E2', 'E3', 'E4', 'W1', 'W2']);
  });

  test('passes clean acyclic and self-loop machines with zero errors and warnings', () => {
    const draft = createMachineDraft({
      capability: 'retry',
      ruleTitle: 'Retry machine',
      scenarioName: 'retry',
      states: [{ name: 'running', initial: true }, { name: 'done' }, { name: 'failed' }],
      transitions: [
        { from: 'running', event: 'retry', guard: 'attempts<3', to: 'running' },
        { from: 'running', event: 'succeed', to: 'done' },
        { from: 'running', event: 'abort', to: 'failed' },
      ],
    });
    const diags = validateMachineGraph(draft.current!);
    expect(diags).toEqual([]);
    expect(hasBlockingDiagnostics(diags)).toBe(false);
  });

  test('collects E2 conflict, E3 unreachable island, E4 deadlock, and W2 placeholder in a single pass without short-circuiting', () => {
    const machine = makeMachine(
      [
        { uid: 's1', name: '草稿' },
        { uid: 's2', name: '审批中' },
        { uid: 's3', name: '已通过' },
        { uid: 's4', name: '死胡同' },
        { uid: 's5', name: '新状态5' },
      ],
      [
        { uid: 'e1', fromUid: 's1', event: '提交', toUid: 's2' },
        { uid: 'e2', fromUid: 's1', event: '提交', toUid: 's4' }, // E2 duplicate
        { uid: 'e3', fromUid: 's2', event: '批准', toUid: 's3' },
        { uid: 'e4', fromUid: 's4', event: '循环', toUid: 's4' }, // E4 deadlock (cannot reach terminal s3)
      ],
      's1',
    );

    const diags = validateMachineGraph(machine);
    expect(hasBlockingDiagnostics(diags)).toBe(true);

    const e2 = diags.find((d) => d.code === 'E2');
    expect(e2).toMatchObject({
      severity: 'error',
      targetKind: 'edge',
      targetId: 'e2',
      relatedIds: ['e1', 'e2'],
      fixable: 'delete-edge',
    });

    const e3 = diags.find((d) => d.code === 'E3' && d.targetId === 's5');
    expect(e3).toMatchObject({ severity: 'error', targetKind: 'state', targetId: 's5' });

    const e4 = diags.find((d) => d.code === 'E4' && d.targetId === 's4');
    expect(e4).toMatchObject({ severity: 'error', targetKind: 'state', targetId: 's4' });

    const w2 = diags.find((d) => d.code === 'W2' && d.targetId === 's5');
    expect(w2).toMatchObject({ severity: 'warning', targetKind: 'state', targetId: 's5' });
  });

  test('reports E1 for empty names / dangling endpoints and E4 trap for cyclic machine without terminals', () => {
    const broken = makeMachine(
      [{ uid: 's1', name: '' }],
      [{ uid: 'e1', fromUid: 's1', event: '', toUid: 's999' }],
      's1',
    );
    const brokenDiags = validateMachineGraph(broken);
    expect(brokenDiags.filter((d) => d.code === 'E1').length).toBeGreaterThanOrEqual(4);

    const trap = makeMachine(
      [
        { uid: 's1', name: 'init' },
        { uid: 's2', name: 'trapped' },
      ],
      [
        { uid: 'e1', fromUid: 's1', event: 'go', toUid: 's2' },
        { uid: 'e2', fromUid: 's2', event: 'spin', toUid: 's2' },
      ],
      's1',
    );
    const trapDiags = validateMachineGraph(trap);
    expect(trapDiags.some((d) => d.code === 'E4' && d.targetId === 's2')).toBe(true);
  });

  test('reports W1 non-blocking warning when a state only has a single guarded outgoing edge', () => {
    const guardedOnly = makeMachine(
      [
        { uid: 's1', name: 'start' },
        { uid: 's2', name: 'end' },
      ],
      [{ uid: 'e1', fromUid: 's1', event: 'go', guard: 'isAdmin', toUid: 's2' }],
      's1',
    );
    const diags = validateMachineGraph(guardedOnly);
    expect(hasBlockingDiagnostics(diags)).toBe(false);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      code: 'W1',
      severity: 'warning',
      targetKind: 'edge',
      targetId: 'e1',
    });
  });

  test('does not alter existing CLI validateAllSpecs transition validation behavior', () => {
    const src = `# language: zh-CN
# purpose: regression check
功能: reg

  @req:r1
  规则: 确定性检查
    系统 MUST 保持确定性。

    场景大纲: 冲突表
      假如 处于 <from>
      当 触发 <event>
      那么 进入 <to>
      例子:
        | from | event | to |
        | a | go | b |
        | a | go | c |
`;
    const report = validateAllSpecs([
      { fileName: 'llmanspec/specs/reg.feature', doc: parseCapability(src, 'reg.feature') },
    ]);
    expect(report.failed).toBe(true);
    expect(report.lines.join('\n')).toContain('non-deterministic or duplicate transition');
  });
});
