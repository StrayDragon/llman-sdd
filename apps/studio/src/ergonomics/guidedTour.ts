// On-demand 6-step interactive guided tour definition (r157).
// Never auto-blocks regular users; triggered explicitly from Canvas Settings or demo-mode banner.

export interface GuidedTourStep {
  id: string;
  title: string;
  summary: string;
  actionHint: string;
  anchorArea: 'top-left' | 'canvas' | 'top-right' | 'bottom-center' | 'bottom-left';
}

export const GUIDED_TOUR_STORAGE_KEY = 'llman-sdd:studio:tour-v1-done';

export const STUDIO_GUIDED_TOUR_STEPS: readonly GuidedTourStep[] = [
  {
    id: 'macro-enter-tab',
    title: '1. 全景视图与显式进入 Tab',
    summary:
      '主视图按领域排他分组呈现当前工作区全部规格。点击卡片右上角「进入 Tab」展开独立画布，左侧图例可一键筛选 4 类规格。',
    actionHint: '提示：Shift + 拖框可选中多张卡片，按 G 打包分组或按 T 新建组合 Tab。',
    anchorArea: 'canvas',
  },
  {
    id: 'drag-connect-spawn',
    title: '2. 拖线选建与快捷键盘流',
    summary:
      '在状态机/流程图画布中，从节点端口拖线到空白处可直接选建下游节点；选中节点按 Tab 速建下游，方向键微调冷表位置。',
    actionHint: '提示：按住连线标签可拖拽微调弧度，双击标签可就地编辑事件与守卫。',
    anchorArea: 'canvas',
  },
  {
    id: 'box-in-box-drill',
    title: '3. 盒中盒 3 层下钻与返回',
    summary:
      '带堆叠阴影的复合状态支持点击「下钻子图」进入 L2/L3 嵌套子状态机，左上角面包屑与 Alt+↑ 可随时逐层回退。',
    actionHint: '提示：画布缩放与位置会按 Tab 独立记忆，切换文档后切回不重置视角。',
    anchorArea: 'top-left',
  },
  {
    id: 'radial-comments',
    title: '4. 右键同心径向菜单与就近评论',
    summary:
      '在画布空白处、节点或连线上右键呼出同心径向菜单，可原地新建、插中间态或就近留评，评论自动附带精确对象锚点。',
    actionHint: '提示：系统已接管画布右键，避免与浏览器原生菜单冲突。',
    anchorArea: 'canvas',
  },
  {
    id: 'worldline-compare',
    title: '5. 世界线分叉对比与 Agent 协商',
    summary:
      '点击右上角「世界线」由同侧滑出历史抽屉（小地图自动左让），支持任意节点对比、漂移校准与一键生成带锚点的协商 Prompt。',
    actionHint: '提示：Agent 回推的虚线修订层需经人类在世界线审阅采纳，绝不静默覆写。',
    anchorArea: 'top-right',
  },
  {
    id: 'save-guard',
    title: '6. 分支写保护与安全保存护栏',
    summary:
      '点击底栏「保存变更」进入三出口写保护向导：受保护主干分支严禁直写规格，可一键切可写 Worktree、建 Change 分支或导出 proposal.md。',
    actionHint: '提示：随时按 ? 打开快捷键速查卡，或从「画布」设置导出 SVG/PNG 只读快照。',
    anchorArea: 'bottom-center',
  },
];

export function readTourCompleted(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem(GUIDED_TOUR_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

export function markTourCompleted(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GUIDED_TOUR_STORAGE_KEY, '1');
    }
  } catch {
    // Ignore storage quota errors
  }
}
