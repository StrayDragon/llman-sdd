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

export function buildDemoStudioWebDrafts(): MachineDraft[] {
  const l1 = createMachineDraft({
    capability: 'studio-web',
    reqId: 'r143',
    ruleTitle: '自举 Studio Web 主状态流转',
    scenarioName: 'Studio Web 主态流转',
    sourceFile: 'llmanspec/specs/studio-web.feature',
    columns: { from: 'from', event: 'event', guard: 'guard', to: 'to' },
    states: [
      { name: '启动与工作区就绪', initial: true },
      { name: '主视图与导航态' },
      { name: '画布直编与草稿态' },
      { name: '推演试跑态' },
      { name: '世界线与验收闭环' },
      { name: '写保护与保存变更' },
    ],
    transitions: [
      { from: '启动与工作区就绪', event: '打开主视图或深链', to: '主视图与导航态' },
      { from: '主视图与导航态', event: '切换工作区或标签', to: '启动与工作区就绪' },
      { from: '主视图与导航态', event: '进入规格编辑', to: '画布直编与草稿态' },
      { from: '画布直编与草稿态', event: '启动单步推演', to: '推演试跑态' },
      { from: '推演试跑态', event: '退出推演', to: '画布直编与草稿态' },
      { from: '画布直编与草稿态', event: '打开世界线与对比', to: '世界线与验收闭环' },
      { from: '世界线与验收闭环', event: '回到画布继续微调', to: '画布直编与草稿态' },
      {
        from: '世界线与验收闭环',
        event: '校验通过保存变更',
        guard: '门禁全绿',
        to: '写保护与保存变更',
      },
      { from: '写保护与保存变更', event: '确认生效返回', to: '主视图与导航态' },
    ],
  });

  const l2Edit = createMachineDraft({
    capability: 'studio-web',
    reqId: 'r143-sub-edit',
    ruleTitle: '画布直编子机',
    scenarioName: '画布直编子流程',
    sourceFile: 'llmanspec/specs/studio-web.feature',
    columns: { from: 'from', event: 'event', guard: 'guard', to: 'to' },
    states: [
      { name: '画布空闲', initial: true },
      { name: '选中图元' },
      { name: '就地编辑文字' },
      { name: '端口拖线连接' },
      { name: '统一评论浮窗' },
    ],
    transitions: [
      { from: '画布空闲', event: '单击节点或连线', to: '选中图元' },
      { from: '选中图元', event: '双击或回车', to: '就地编辑文字' },
      { from: '就地编辑文字', event: '提交防抖保存', to: '画布空闲' },
      { from: '选中图元', event: '拖拽端口圆点', to: '端口拖线连接' },
      { from: '端口拖线连接', event: '松手吸附或选建', to: '画布空闲' },
      { from: '选中图元', event: '右键留评论', to: '统一评论浮窗' },
      { from: '统一评论浮窗', event: '关闭浮窗', to: '画布空闲' },
    ],
  });

  const l3Wire = createMachineDraft({
    capability: 'studio-web',
    reqId: 'r143-sub-wire',
    ruleTitle: '拖线连接与选建子机',
    scenarioName: '端口拖线微循环',
    sourceFile: 'llmanspec/specs/studio-web.feature',
    columns: { from: 'from', event: 'event', guard: 'guard', to: 'to' },
    states: [
      { name: '拉出临时虚线', initial: true },
      { name: '吸附目标节点' },
      { name: '拖空选建圆盘' },
      { name: '写入本地草稿' },
    ],
    transitions: [
      { from: '拉出临时虚线', event: '悬停目标节点', to: '吸附目标节点' },
      { from: '吸附目标节点', event: '松手建边', to: '写入本地草稿' },
      { from: '拉出临时虚线', event: '空白处松手', to: '拖空选建圆盘' },
      { from: '拖空选建圆盘', event: '选建新节点并连线', to: '写入本地草稿' },
      { from: '拖空选建圆盘', event: '按 Esc 取消', to: '拉出临时虚线' },
      { from: '写入本地草稿', event: '继续拖线', to: '拉出临时虚线' },
    ],
  });

  // Wire L1 -> L2 -> L3 nested subMachineKey links cleanly
  if (l1.current) {
    const editNode = l1.current.states.find((s) => s.name === '画布直编与草稿态');
    if (editNode && l2Edit.current) editNode.subMachineKey = l2Edit.current.machineKey;
  }
  if (l2Edit.current) {
    const wireNode = l2Edit.current.states.find((s) => s.name === '端口拖线连接');
    if (wireNode && l3Wire.current) wireNode.subMachineKey = l3Wire.current.machineKey;
  }

  return [l1, l2Edit, l3Wire];
}

export function buildDemoStudioDrafts(): MachineDraft[] {
  return [buildDemoReimbursementDraft(), buildDemoJobRunnerDraft()];
}
