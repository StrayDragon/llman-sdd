// Registry-driven keyboard shortcut catalog for Studio Web (r157).
// Strictly lists only shortcuts actually wired in the live UI (Axiom 6: zero placeholder entries).

export type ShortcutScope = 'global' | 'macro' | 'machine' | 'doc';

export interface ShortcutEntry {
  id: string;
  keys: readonly string[];
  label: string;
  detail: string;
  scope: ShortcutScope;
}

export const STUDIO_SHORTCUT_REGISTRY: readonly ShortcutEntry[] = [
  {
    id: 'cmdk',
    keys: ['⌘', 'K'],
    label: '全局检索与命令面板',
    detail: '快速跳转任意规格、状态节点或工作台命令',
    scope: 'global',
  },
  {
    id: 'help',
    keys: ['?'],
    label: '快捷键速查卡',
    detail: '按当前视图过滤显示可用快捷键',
    scope: 'global',
  },
  {
    id: 'nav-back',
    keys: ['Alt', '←'],
    label: '后退视图历史',
    detail: '回到上一个 Tab、画布或下钻层级',
    scope: 'global',
  },
  {
    id: 'nav-forward',
    keys: ['Alt', '→'],
    label: '前进视图历史',
    detail: '前往下一条视图浏览记录',
    scope: 'global',
  },
  {
    id: 'undo',
    keys: ['⌘', 'Z'],
    label: '撤销画布编辑',
    detail: '撤销当前状态机最近一次结构变更',
    scope: 'machine',
  },
  {
    id: 'redo',
    keys: ['⌘', '⇧', 'Z'],
    label: '重做画布编辑',
    detail: '恢复刚撤销的状态机变更',
    scope: 'machine',
  },
  {
    id: 'nest-up',
    keys: ['Alt', '↑'],
    label: '返回上层状态机',
    detail: '从盒中盒 L2/L3 子图回到父级状态图',
    scope: 'machine',
  },
  {
    id: 'tab-spawn',
    keys: ['Tab'],
    label: '速建下游状态',
    detail: '选中状态节点时在右侧新建下游状态并自动连线',
    scope: 'machine',
  },
  {
    id: 'enter-edit',
    keys: ['Enter'],
    label: '就地编辑状态名',
    detail: '对当前选中的状态节点打开浮层改名',
    scope: 'machine',
  },
  {
    id: 'delete-item',
    keys: ['Delete'],
    label: '删除选中节点或连线',
    detail: '删除当前聚焦的状态节点或转移边',
    scope: 'machine',
  },
  {
    id: 'arrow-nudge',
    keys: ['↑↓←→'],
    label: '方向键微调节点坐标',
    detail: '按 8px（配合 Shift 按 24px）微调冷表位置，不污染语义 Diff',
    scope: 'machine',
  },
  {
    id: 'shift-box-select',
    keys: ['Shift', '拖框'],
    label: '批量框选规格卡片',
    detail: '在主视图或组合视图中一次选中多张卡片以分组、对齐或建 Tab',
    scope: 'macro',
  },
  {
    id: 'macro-group',
    keys: ['G'],
    label: '多选打包领域分组',
    detail: '选中至少 2 张规格卡时一键生成排他手动分组',
    scope: 'macro',
  },
  {
    id: 'macro-tab',
    keys: ['T'],
    label: '多选新建组合 Tab',
    detail: '以当前选中的规格卡创建专属工作区聚焦视图',
    scope: 'macro',
  },
  {
    id: 'macro-arrow-nudge',
    keys: ['↑↓←→'],
    label: '方向键微调选中卡片',
    detail: '按 8px（Shift 按 24px）微调卡片冷表位置',
    scope: 'macro',
  },
  {
    id: 'escape',
    keys: ['Esc'],
    label: '关闭浮层与菜单',
    detail: '收起命令面板、设置浮窗、评论气泡或速查卡',
    scope: 'global',
  },
];

export type ViewDialectFilter = 'all' | 'macro' | 'machine' | 'doc';

export function filterShortcutsByView(
  view: ViewDialectFilter,
  registry: readonly ShortcutEntry[] = STUDIO_SHORTCUT_REGISTRY,
): ShortcutEntry[] {
  if (view === 'all') return [...registry];
  return registry.filter((item) => item.scope === 'global' || item.scope === view);
}

export function scopeLabel(scope: ShortcutScope): string {
  switch (scope) {
    case 'global':
      return '全局导航';
    case 'macro':
      return '全景与组合视图';
    case 'machine':
      return '状态机与流程图';
    case 'doc':
      return '规则文档与决策表';
  }
}
