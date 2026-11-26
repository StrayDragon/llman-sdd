/**
 * Built-in demo state machines for zero-table repos (`--demo`) and unit tests (studio-core r132).
 * Both demos are guaranteed to pass validateMachineGraph with zero blocking errors.
 */
import { createMachineDraft } from './extract.ts';
import type { MachineDraft } from './model.ts';

export function buildDemoReimbursementDraft(): MachineDraft {
  return createMachineDraft({
    capability: 'demo-reimbursement',
    reqId: 'demo-r1',
    ruleTitle: '报销审批状态流转',
    scenarioName: '报销审批主流程',
    sourceFile: 'llmanspec/specs/demo-reimbursement.feature',
    columns: { from: '初始状态', event: '事件', guard: '守卫', to: '目标状态' },
    states: [
      { name: '草稿', initial: true },
      { name: '待审批' },
      { name: '已通过' },
      { name: '已驳回' },
    ],
    transitions: [
      { from: '草稿', event: '提交', to: '待审批' },
      { from: '待审批', event: '批准', guard: '金额<=5000', to: '已通过' },
      { from: '待审批', event: '批准', guard: '老板审批', to: '已通过' },
      { from: '待审批', event: '驳回', to: '已驳回' },
      { from: '已驳回', event: '修改重提', to: '待审批' },
    ],
  });
}

export function buildDemoJobRunnerDraft(): MachineDraft {
  return createMachineDraft({
    capability: 'demo-job-runner',
    reqId: 'demo-r2',
    ruleTitle: '任务执行与重试状态流转',
    scenarioName: '任务生命周期',
    sourceFile: 'llmanspec/specs/demo-job-runner.feature',
    columns: { from: 'from', event: 'event', guard: 'guard', to: 'to' },
    states: [
      { name: 'queued', initial: true },
      { name: 'running' },
      { name: 'succeeded' },
      { name: 'failed' },
      { name: 'cancelled' },
    ],
    transitions: [
      { from: 'queued', event: 'start', to: 'running' },
      { from: 'queued', event: 'cancel', to: 'cancelled' },
      { from: 'running', event: 'succeed', to: 'succeeded' },
      { from: 'running', event: 'retry', guard: 'retry_left>0', to: 'running' },
      { from: 'running', event: 'fail', guard: 'retry_left==0', to: 'failed' },
      { from: 'running', event: 'cancel', to: 'cancelled' },
    ],
  });
}

export function buildDemoStudioDrafts(): MachineDraft[] {
  return [buildDemoReimbursementDraft(), buildDemoJobRunnerDraft()];
}
