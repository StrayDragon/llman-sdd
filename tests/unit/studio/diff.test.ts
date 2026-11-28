import { describe, expect, test } from 'bun:test';

import {
  cloneMachineIR,
  computeMachineDiff,
  createMachineDraft,
  formatSemanticDiff,
  markMachineRemoved,
  type MachineDraft,
} from '@llman-sdd/core';

function baseModifyDraft(): MachineDraft {
  const created = createMachineDraft({
    capability: 'reimbursement',
    reqId: 'r10',
    ruleTitle: '报销审批',
    scenarioName: '主流程',
    states: [{ name: '草稿', initial: true }, { name: '待审批' }, { name: '已通过' }],
    transitions: [
      { from: '草稿', event: '提交', to: '待审批' },
      { from: '待审批', event: '批准', guard: '金额<=5000', to: '已通过' },
    ],
  });
  return {
    mode: 'modify',
    baseline: cloneMachineIR(created.current!),
    current: cloneMachineIR(created.current!),
    sourceFile: created.sourceFile,
  };
}

describe('studio/diff (r130)', () => {
  test('returns zero changes when baseline and current match (ignoring external layouts)', () => {
    const draft = baseModifyDraft();
    const diff = computeMachineDiff(draft);
    expect(diff.hasChanges).toBe(false);
    expect(formatSemanticDiff(diff, draft)).toBe('# no semantic changes');
  });

  test('tracks state rename by uid without creating false transition deletions or additions', () => {
    const draft = baseModifyDraft();
    // Rename s2 ("待审批" -> "主管审核") and update e2 guard only
    draft.current!.states[1]!.name = '主管审核';
    draft.current!.transitions[1]!.guard = '金额<=10000';

    const diff = computeMachineDiff(draft);
    expect(diff.hasChanges).toBe(true);
    expect(diff.statesAdded).toEqual([]);
    expect(diff.statesRemoved).toEqual([]);
    expect(diff.statesRenamed).toEqual([{ uid: 's2', from: '待审批', to: '主管审核' }]);
    expect(diff.transitionsAdded).toEqual([]);
    expect(diff.transitionsRemoved).toEqual([]);
    expect(diff.transitionsModified).toHaveLength(1);
    expect(diff.transitionsModified[0]?.changedFields).toEqual(['guard']);

    const summary = formatSemanticDiff(diff, draft);
    expect(summary).toContain('~ rename state: 待审批 -> 主管审核');
    expect(summary).toContain('guard: "金额<=5000" -> "金额<=10000"');
    expect(summary).not.toContain('- 待审批');
  });

  test('handles create and remove modes cleanly', () => {
    const created = createMachineDraft({
      capability: 'billing',
      ruleTitle: '账单流转',
      scenarioName: '账单',
      states: [{ name: 'open', initial: true }, { name: 'paid' }],
      transitions: [{ from: 'open', event: 'pay', to: 'paid' }],
    });
    const createDiff = computeMachineDiff(created);
    expect(createDiff.hasChanges).toBe(true);
    expect(createDiff.statesAdded).toHaveLength(2);
    expect(createDiff.transitionsAdded).toHaveLength(1);
    expect(formatSemanticDiff(createDiff, created)).toContain('+ open --[pay]--> paid');

    const removed = markMachineRemoved(baseModifyDraft());
    const removeDiff = computeMachineDiff(removed);
    expect(removeDiff.mode).toBe('remove');
    expect(removeDiff.hasChanges).toBe(true);
    expect(removeDiff.statesRemoved).toHaveLength(3);
    expect(formatSemanticDiff(removeDiff, removed)).toContain('- [remove machine]');
  });
});
