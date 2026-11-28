/**
 * Production-facing copy for file-sync HUD and activity (studio-web r165, r166).
 * Internal algorithm names stay out of this table.
 */
export const SYNC_COPY = {
  banner: '这份规格在别处被改过了。你在画布上的修改还在。',
  attentionTitle: '规格在别处改过了',
  snapshotHint: '已帮你在「世界线」里留了一份刚才的版本。',
  lookItemByItem: '逐条看看',
  keepMineAll: '先留我刚改的',
  takeTheirsAll: '先用文件里的',
  keepMine: '留我刚改的',
  takeTheirs: '用文件里的新内容',
  keepBoth: '两条都留',
  done: '做完了',
  yours: '你在本画布的调整',
  incoming: '文件里新来的',
  canvasShort: '本画布',
  fileShort: '文件',
  empty: '没有',
  sameThing: '这两条是同一件事，请选留哪一条',
  worldlineCell: '刚才在画布上的版本',
  peerSaved: '另一处工作区刚保存了这份规格',
  driftPending: '代码运行里看到了规格里没有的变化',
  tabRevision: '另一扇窗口刚保存了这份草稿',
  watchWho: '请谁看',
  promptSubset: '只带我勾的看法',
} as const;

export function activityBadgeLabel(n: number): string {
  return `还有人在改 · ${n}`;
}

export function agentCommentLabel(anchorShort: string): string {
  return `有人在「${anchorShort}」留下了看法`;
}

export const SYNC_FORBIDDEN_UI = [
  'BASE',
  'LOCAL',
  'REMOTE',
  'baseHash',
  'stale',
  '409',
  'SSE',
  '自动快照',
  'timeline commit',
  '采纳磁盘更新',
  '三方合并',
  'Agent activity',
  'comment on macro-edge',
  'state-updated',
  'revision conflict',
  'snapshot-before-sync',
  'blocked both',
] as const;

export function copyContainsForbidden(text: string): string | null {
  for (const word of SYNC_FORBIDDEN_UI) {
    if (text.includes(word)) return word;
  }
  return null;
}

export type HudSlot = 'worldline-compare' | 'drift' | 'simulate' | 'tips' | null;

export function syncSideCaption(raw: string | null | undefined): string {
  if (!raw) return SYNC_COPY.empty;
  const wrapped = /^状态「(.+)」$/u.exec(raw);
  return wrapped?.[1] ?? raw;
}

export function pickTopHudSlot(input: {
  syncOpen?: boolean;
  worldlineComparing: boolean;
  hasDrift: boolean;
  simulating: boolean;
  showTips: boolean;
}): HudSlot {
  // File-sync occupies the bottom conflict dock, not the top-center slot.
  if (input.worldlineComparing) return 'worldline-compare';
  if (input.hasDrift) return 'drift';
  if (input.simulating) return 'simulate';
  if (input.showTips) return 'tips';
  return null;
}
