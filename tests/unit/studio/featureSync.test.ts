import { describe, expect, test } from 'bun:test';

import {
  StudioSyncError,
  buildProposalDraft,
  createMachineDraft,
  extractStudioMachines,
  markMachineRemoved,
  parseCapability,
  previewFeatureUnifiedDiff,
  renderUpdatedFeatureSource,
  validateCapability,
  validateChange,
  type ChangeFsIoLite,
  type SpecEntry,
} from '@llman-sdd/core';

const ORIGINAL_FEATURE = `# language: zh-CN
# purpose: 报销审批能力规范

功能: expense

  @req:r10
  规则: 报销审批流转
    报销单 MUST 按状态流转表流转。

    # 保留这段业务注释
    场景大纲: 报销主流程
      假如 当前处于 <初始状态> 且满足 <守卫>
      当 触发 <事件>
      那么 进入 <目标状态>

      例子:
        | 初始状态 | 事件 | 守卫 | 目标状态 |
        | 草稿 | 提交 |  | 待审批 |
        | 待审批 | 批准 | 金额<=5000 | 已通过 |
        | 待审批 | 驳回 |  | 已驳回 |
        | 已驳回 | 修改重提 |  | 待审批 |
`;

const DRIFTED_FEATURE = `# language: zh-CN
# purpose: 报销审批能力规范

功能: expense

  @req:r9
  规则: 新增的前置规则
    系统 MUST 记录审计日志。

    # 额外插入了多行内容，造成下方状态机场景行号整体漂移
    场景: 审计记录
      假如 一张报销单
      当 提交报销
      那么 写入审计日志

  @req:r10
  规则: 报销审批流转
    报销单 MUST 按状态流转表流转。

    # 保留这段业务注释
    场景大纲: 报销主流程
      假如 当前处于 <初始状态> 且满足 <守卫>
      当 触发 <事件>
      那么 进入 <目标状态>

      例子:
        | 初始状态 | 事件 | 守卫 | 目标状态 |
        | 草稿 | 提交 |  | 待审批 |
        | 待审批 | 批准 | 金额<=5000 | 已通过 |
        | 待审批 | 驳回 |  | 已驳回 |
        | 已驳回 | 修改重提 |  | 待审批 |
`;

describe('studio/featureSync (r133)', () => {
  test('losslessly replaces target Examples table after line-number drift, preserves comments, and passes validateCapability', () => {
    const entry: SpecEntry = {
      fileName: 'llmanspec/specs/expense.feature',
      specId: 'expense',
      doc: parseCapability(ORIGINAL_FEATURE, 'llmanspec/specs/expense.feature'),
    };
    const extracted = extractStudioMachines([entry]);
    expect(extracted).toHaveLength(1);
    const draft = extracted[0]!.draft;

    // Modify draft: rename "待审批" -> "主管审核" and tighten guard
    draft.current!.states[1]!.name = '主管审核';
    draft.current!.transitions[1]!.guard = '金额<=3000';

    // Apply onto DRIFTED_FEATURE (which inserted an extra rule above!)
    const rendered = renderUpdatedFeatureSource(DRIFTED_FEATURE, draft);
    expect(rendered).toContain('# 额外插入了多行内容，造成下方状态机场景行号整体漂移');
    expect(rendered).toContain('# 保留这段业务注释');
    expect(rendered).toContain('主管审核');
    expect(rendered).toContain('金额<=3000');

    // Unified Diff preview via jsdiff
    const patch = previewFeatureUnifiedDiff(
      'llmanspec/specs/expense.feature',
      DRIFTED_FEATURE,
      rendered,
    );
    expect(patch).toContain('--- a/llmanspec/specs/expense.feature');
    expect(patch).toContain('+++ b/llmanspec/specs/expense.feature');
    expect(patch).toContain('主管审核');

    // Round-trip: parseCapability + validateCapability must pass cleanly
    const reparsed = parseCapability(rendered, 'llmanspec/specs/expense.feature');
    const verdict = validateCapability(
      { fileName: 'llmanspec/specs/expense.feature', specId: 'expense', doc: reparsed },
      () => false,
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.items.filter((i) => i.level === 'ERROR')).toEqual([]);
  });

  test('supports create mode for brand-new feature file and appending to existing feature file', () => {
    const created = createMachineDraft({
      capability: 'refund',
      reqId: 'r20',
      ruleTitle: '退款状态机',
      scenarioName: '退款主流程',
      states: [{ name: '申请中', initial: true }, { name: '已退款' }, { name: '已拒绝' }],
      transitions: [
        { from: '申请中', event: '批准', guard: '审核通过', to: '已退款' },
        { from: '申请中', event: '拒绝', to: '已拒绝' },
      ],
    });

    const fresh = renderUpdatedFeatureSource(null, created);
    const freshVerdict = validateCapability(
      {
        fileName: 'llmanspec/specs/refund.feature',
        specId: 'refund',
        doc: parseCapability(fresh, 'llmanspec/specs/refund.feature'),
      },
      () => false,
    );
    expect(freshVerdict.ok).toBe(true);

    const appended = renderUpdatedFeatureSource(ORIGINAL_FEATURE, created);
    const appendedVerdict = validateCapability(
      {
        fileName: 'llmanspec/specs/expense.feature',
        specId: 'expense',
        doc: parseCapability(appended, 'llmanspec/specs/expense.feature'),
      },
      () => false,
    );
    expect(appendedVerdict.ok).toBe(true);
    expect(appended).toContain('@req:r10');
    expect(appended).toContain('@req:r20');
  });

  test('supports remove mode and throws StudioSyncError when target scenario is missing', () => {
    const entry: SpecEntry = {
      fileName: 'llmanspec/specs/expense.feature',
      specId: 'expense',
      doc: parseCapability(DRIFTED_FEATURE, 'llmanspec/specs/expense.feature'),
    };
    const extracted = extractStudioMachines([entry]);
    const removedDraft = markMachineRemoved(extracted[0]!.draft);

    const afterRemove = renderUpdatedFeatureSource(DRIFTED_FEATURE, removedDraft);
    expect(afterRemove).toContain('@req:r9');
    expect(afterRemove).not.toContain('报销主流程');

    expect(() => renderUpdatedFeatureSource(afterRemove, extracted[0]!.draft)).toThrow(
      StudioSyncError,
    );
  });

  test('buildProposalDraft outputs a valid proposal.md accepted by validateChange', () => {
    const created = createMachineDraft({
      capability: 'refund',
      reqId: 'r20',
      ruleTitle: '退款状态机',
      scenarioName: '退款主流程',
      states: [{ name: '申请中', initial: true }, { name: '已退款' }],
      transitions: [{ from: '申请中', event: '批准', to: '已退款' }],
    });

    const proposalMd = buildProposalDraft({
      title: '新增退款状态机规范',
      why: '将退款审批纳入可验证的状态流转表。',
      drafts: [created],
      comments: [
        {
          id: 'c1',
          anchor: { kind: 'machine', machineKey: created.current!.machineKey },
          author: 'human',
          body: '确认仅保留主干分支。',
          createdAt: '2026-11-26T12:00:00Z',
          status: 'resolved',
        },
      ],
    });

    const proposalPath = '/repo/llmanspec/changes/add-refund-machine/proposal.md';
    const io: ChangeFsIoLite = {
      exists: (p) => p === proposalPath,
      readText: (p) => (p === proposalPath ? proposalMd : ''),
      listDir: () => ['add-refund-machine'],
      isDirectory: (p) => p === '/repo/llmanspec/changes/add-refund-machine',
    };
    const check = validateChange(io, '/repo', 'add-refund-machine', {});
    expect(check.valid).toBe(true);
    expect(check.issues.filter((i) => i.level === 'ERROR')).toEqual([]);
    expect(proposalMd).toContain('## Why');
    expect(proposalMd).toContain('## What Changes');
    expect(proposalMd).toContain('+ 申请中 --[批准]--> 已退款');
  });
});
