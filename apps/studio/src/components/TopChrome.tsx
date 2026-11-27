/**
 * Top Chrome (Demo Visual Craft):
 * - Top-Left: Dark brand glyph + studio, ‹/› nav, kind-icon tabs, live draft diff chip
 * - Top-Right: Custom .ws-pill workspace popover, clickable .linter-pill diagnostic popover with
 *   locate-on-canvas & E2 auto-fix, Worldline (N) trigger, Undo/Redo (⌘Z/⌘⇧Z), ⌘K
 * - Top-Center: Single-Slot Exclusive HUD (Axiom 2: CompareBanner > SimulateBanner > Tips Capsule)
 */
import { computeMachineDiff, computeWorldlineOverlayDiff } from '@llman-sdd/core/studio';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  FileText,
  GitBranch,
  Layers,
  Pin,
  Plus,
  Redo2,
  RotateCcw,
  Share2,
  Shield,
  Table2,
  Undo2,
  Wrench,
  Workflow,
  X,
} from 'lucide-react';
import { useState } from 'react';

import {
  buildTruthWinsPrompt,
  countShadowEdgesInProposals,
  getPendingDriftProposals,
} from '../drift/reconcileOverlay.ts';
import { useStudioStore } from '../store/studioStore.ts';

const TIPS = [
  '空白处或节点/连线右键呼出同心径向菜单，可原地新建、插中间态、改事件或留评论',
  '拖拽节点左右圆点可直接连线；拖到空白处松手可按方言原地新建并自动连线',
  '双击节点或连线标签即可浮窗就地编辑（无弹窗）；按住连线标签拖动微调弧度',
  '点击右上角「世界线」在右侧查看分支树，点「与当前对比」在画布 1:1 红绿叠加',
];

export function TopChrome() {
  const {
    workspaces,
    activeWorkspace,
    peerWorktrees,
    stateDoc,
    tabs,
    activeTabId,
    navIdx,
    navHistory,
    saveStatus,
    worldlineOpen,
    worldlineComparing,
    worldlineCompareAId,
    linterOpen,
    mode,
    showTips,
    tipIdx,
    activateTab,
    closeTab,
    togglePinTab,
    closeOtherUnpinnedTabs,
    restoreDefaultTabs,
    reorderTab,
    navBack,
    navForward,
    switchWorkspace,
    setWorldlineOpen,
    toggleWorldlineCompare,
    setLinterOpen,
    setFocusStateUid,
    undoActiveMachine,
    redoActiveMachine,
    connectStates,
    deleteEdge,
    setCmdkOpen,
    setShowTips,
    stepTip,
    decideRevision,
    openPromptWorkbench,
    openMachineTab,
    openNewTabPage,
    getActiveMachineKey,
    getDiagnosticsForMachine,
  } = useStudioStore();

  const [wsOpen, setWsOpen] = useState(false);
  const [lintFilter, setLintFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ id: string; before: boolean } | null>(null);
  const [tabCtx, setTabCtx] = useState<{ tabId: string; x: number; y: number } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isStartPage = activeTab?.kind === 'new-tab';
  const isDocPage = activeTab?.kind === 'doc';
  const activeMachineKey = getActiveMachineKey();
  const activeDraft = activeMachineKey ? stateDoc?.machines[activeMachineKey] : undefined;
  const diags = activeMachineKey ? getDiagnosticsForMachine(activeMachineKey) : [];
  const errCount = diags.filter((d) => d.severity === 'error').length;
  const warnCount = diags.filter((d) => d.severity === 'warning').length;
  const filteredDiags = diags.filter((d) => lintFilter === 'all' || d.severity === lintFilter);

  const activeDiff = activeDraft ? computeMachineDiff(activeDraft) : null;
  const activeTimeline = activeMachineKey ? stateDoc?.timelines[activeMachineKey] : undefined;
  const canUndo = Boolean(activeTimeline && activeTimeline.headIdx > 0);
  const canRedo = Boolean(
    activeTimeline && activeTimeline.headIdx < activeTimeline.entries.length - 1,
  );
  const wlCount = activeTimeline ? Math.max(0, activeTimeline.entries.length - 1) : 0;

  // Compute live +N / -M counts for Worldline Compare Banner
  const compareStats = (() => {
    if (!worldlineComparing || !worldlineCompareAId || !activeMachineKey || !stateDoc) return null;
    const tl = stateDoc.timelines[activeMachineKey];
    const snapA = tl?.entries.find((e) => e.id === worldlineCompareAId)?.snapshot ?? null;
    const snapB = stateDoc.machines[activeMachineKey]?.current ?? null;
    const ov = computeWorldlineOverlayDiff(snapA, snapB);
    return {
      added: ov.addedStateUids.length + ov.addedEdgeUids.length,
      removed: ov.removedStates.length + ov.removedEdges.length,
    };
  })();

  const pendingDriftProposals = stateDoc
    ? getPendingDriftProposals(stateDoc.revisions, activeMachineKey)
    : [];
  const allPendingDriftProposals = stateDoc ? getPendingDriftProposals(stateDoc.revisions) : [];
  const hudDriftProposals =
    pendingDriftProposals.length > 0 ? pendingDriftProposals : allPendingDriftProposals;
  const driftShadowCount = countShadowEdgesInProposals(hudDriftProposals);

  // Single-Slot Top-Center HUD Exclusivity (Axiom 2): CompareBanner > DriftCalibrationBanner > SimulateBanner > Tips Capsule
  // Context-Aware Chrome (matching studio-demo.html): hide Tips & graph banners on + New Tab & Doc pages to prevent overlap!
  const renderTopCenterHud = () => {
    if (isStartPage) return null;
    if (worldlineComparing && worldlineCompareAId) {
      return (
        <div
          data-top-slot=""
          className="fixed top-[54px] z-40 inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-xs shadow-lg"
          style={{
            left: worldlineOpen ? 'calc((100vw - 356px) / 2)' : '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: 'var(--surface)',
          }}
        >
          <span>
            画布实时对比：<strong>{worldlineCompareAId}</strong> ↔ 当前分叉
          </span>
          {compareStats && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
              <span style={{ color: '#6ee7b7' }}>+{compareStats.added} 新增</span>
              <span style={{ color: '#fca5a5' }}>-{compareStats.removed} 移除</span>
            </span>
          )}
          <span className="opacity-70 hidden sm:inline">可直接右键差异节点留评论或编辑</span>
          <button
            type="button"
            onClick={() => toggleWorldlineCompare(worldlineCompareAId)}
            className="rounded-full px-2.5 py-0.5 text-[11px] border border-white/25 bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            退出对比
          </button>
        </div>
      );
    }
    if (hudDriftProposals.length > 0 && stateDoc && activeWorkspace) {
      const firstDrift = hudDriftProposals[0]!;
      const targetDraft = stateDoc.machines[firstDrift.machineKey];
      const targetMachineKey = firstDrift.machineKey;
      return (
        <div
          role="status"
          aria-label="逻辑漂移校准提示"
          data-top-slot=""
          className="fixed top-[54px] z-35 studio-island inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs shadow-sm"
          style={{
            left: worldlineOpen ? 'calc((100vw - 356px) / 2)' : '50%',
            transform: 'translateX(-50%)',
            borderColor: 'var(--green-border)',
            background: 'var(--green-soft)',
            color: 'var(--ink)',
          }}
        >
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: 'var(--green)', color: '#ffffff' }}
          >
            逻辑漂移校准
          </span>
          <span>
            代码运行中观测到 <strong>{driftShadowCount || hudDriftProposals.length}</strong>{' '}
            条未登记状态转移，请团队裁决
          </span>
          <button
            type="button"
            onClick={() => {
              openPromptWorkbench(
                '逻辑漂移校准 · 真理胜出',
                '附 Trace 观测证据与精确规格锚点，确认后复制给编码 Agent 清理违规实现代码',
                buildTruthWinsPrompt({
                  repo: activeWorkspace.repo,
                  branch: activeWorkspace.branch,
                  wsKey: activeWorkspace.wsKey,
                  stateId: stateDoc.id,
                  machineKey: targetMachineKey,
                  sourceFile: targetDraft?.sourceFile ?? '',
                  proposals: hudDriftProposals.filter((p) => p.machineKey === targetMachineKey),
                }),
              );
            }}
            className="rounded-full border px-2 py-0.5 text-[11px] font-medium cursor-pointer hover:bg-black/5"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            真理胜出
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeMachineKey !== targetMachineKey) {
                openMachineTab(
                  targetMachineKey,
                  targetDraft?.current?.capability ?? targetMachineKey,
                );
              }
              void decideRevision(firstDrift.id, 'accept').then(() => {
                if (getDiagnosticsForMachine(targetMachineKey).length > 0) {
                  setLinterOpen(true);
                }
              });
            }}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer"
            style={{ background: 'var(--green)', color: '#ffffff' }}
          >
            追认新意图
          </button>
          <button
            type="button"
            onClick={() => setWorldlineOpen(true)}
            className="rounded-full px-1.5 py-0.5 text-[11px] underline cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            世界线
          </button>
        </div>
      );
    }
    if (mode === 'simulate') {
      return (
        <div
          data-top-slot=""
          className="fixed top-[54px] left-1/2 -translate-x-1/2 z-30 studio-island inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs"
          style={{
            borderColor: 'var(--accent)',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
          }}
        >
          <span className="font-semibold">推演试跑中</span>
          <span>点击画布高亮出边或底栏事件胶囊单步推进，可实时切换守卫开关</span>
        </div>
      );
    }
    if (!showTips || isDocPage) return null;
    return (
      <div
        data-top-slot=""
        className="fixed top-[54px] left-1/2 -translate-x-1/2 z-20 studio-island inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs"
        style={{ width: 560, maxWidth: 'calc(100vw - 440px)', color: 'var(--text-secondary)' }}
      >
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          小贴士 {tipIdx + 1}/{TIPS.length}
        </span>
        <span className="truncate flex-1">{TIPS[tipIdx]}</span>
        <div className="inline-flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            aria-label="上一条提示"
            onClick={() => stepTip(-1)}
            className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            aria-label="下一条提示"
            onClick={() => stepTip(1)}
            className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
          >
            <ChevronRight size={12} />
          </button>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setShowTips(false)}
            className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  };

  const allWorkspaceEntries = [
    ...workspaces,
    ...peerWorktrees.filter((pw) => !workspaces.some((w) => w.wsKey === pw.wsKey)),
  ];

  return (
    <>
      {/* Top-Left Dock: Brand Glyph + Symmetric ‹/› Nav + Kind-Icon Tabs + Draft Diff Chip */}
      <div className="fixed top-3 left-3 z-30 flex items-center gap-1.5 max-w-[56vw]">
        <div className="studio-island flex items-center gap-0.5 p-[3px] overflow-x-auto">
          <div className="inline-flex items-center gap-1.5 pl-1 pr-2 h-7 font-mono text-[11.5px] font-bold tracking-tight select-none shrink-0">
            <span
              className="w-[19px] h-[19px] rounded-[5px] inline-flex items-center justify-center"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <Share2 size={11} />
            </span>
            <span>studio</span>
          </div>

          <div
            className="inline-flex items-center border-l pl-1 shrink-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              title="后退视图 (Alt+←)"
              disabled={navIdx <= 0}
              onClick={navBack}
              className="w-7 h-7 inline-flex items-center justify-center rounded-md disabled:opacity-35 hover:bg-black/5 cursor-pointer"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              title="前进视图 (Alt+→)"
              disabled={navIdx >= navHistory.length - 1}
              onClick={navForward}
              className="w-7 h-7 inline-flex items-center justify-center rounded-md disabled:opacity-35 hover:bg-black/5 cursor-pointer"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          <div className="flex items-center gap-0.5 pl-0.5">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId;
              const TabIcon = tab.pinned
                ? Pin
                : tab.kind === 'machine'
                  ? Workflow
                  : tab.kind === 'forest'
                    ? Layers
                    : tab.kind === 'new-tab'
                      ? Plus
                      : tab.title.includes('lifecycle')
                        ? Table2
                        : FileText;
              const dropCls =
                dropIndicator?.id === tab.id
                  ? dropIndicator.before
                    ? ' tab-drop-before'
                    : ' tab-drop-after'
                  : '';
              return (
                <div
                  key={tab.id}
                  draggable
                  title={tab.pinned ? '已置顶（拖动换序 · 右键管理）' : '拖动换序 · 右键置顶或关闭'}
                  onDragStart={(e) => {
                    setDragTabId(tab.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', tab.id);
                  }}
                  onDragEnd={() => {
                    setDragTabId(null);
                    setDropIndicator(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragTabId || dragTabId === tab.id) return;
                    const src = tabs.find((x) => x.id === dragTabId);
                    if (!src || Boolean(src.pinned) !== Boolean(tab.pinned)) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDropIndicator({
                      id: tab.id,
                      before: e.clientX < rect.left + rect.width / 2,
                    });
                  }}
                  onDragLeave={() => {
                    if (dropIndicator?.id === tab.id) setDropIndicator(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const srcId = dragTabId ?? e.dataTransfer.getData('text/plain');
                    const rect = e.currentTarget.getBoundingClientRect();
                    const before = e.clientX < rect.left + rect.width / 2;
                    setDragTabId(null);
                    setDropIndicator(null);
                    if (srcId && srcId !== tab.id) reorderTab(srcId, tab.id, before);
                  }}
                  onClick={() => activateTab(tab.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTabCtx({ tabId: tab.id, x: e.clientX, y: e.clientY });
                  }}
                  className={`inline-flex items-center gap-1.5 h-7 rounded-md px-2.5 text-[12px] font-medium cursor-pointer select-none transition-colors shrink-0${dropCls}`}
                  style={{
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? '#ffffff' : 'var(--text-secondary)',
                    opacity: dragTabId === tab.id ? 0.55 : 1,
                  }}
                >
                  <TabIcon size={11} />
                  <span className="max-w-[140px] truncate">{tab.title}</span>
                  {!tab.pinned && (
                    <button
                      type="button"
                      aria-label={`关闭 ${tab.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="w-3.5 h-3.5 rounded inline-flex items-center justify-center opacity-65 hover:opacity-100 hover:bg-white/20"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              title="打开新标签页（按当前工作区动态聚合规格与标签）"
              onClick={openNewTabPage}
              className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-black/5 cursor-pointer shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Clean Browser-Grade Tab Right-Click Menu (Matching studio-demo.html) */}
        {tabCtx &&
          (() => {
            const targetTab = tabs.find((x) => x.id === tabCtx.tabId);
            if (!targetTab) return null;
            return (
              <>
                <div
                  className="fixed inset-0 z-[78]"
                  onClick={() => setTabCtx(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabCtx(null);
                  }}
                />
                <div
                  role="menu"
                  aria-label="标签页管理菜单"
                  className="fixed z-[79] studio-float w-48 p-1.5 flex flex-col gap-0.5 text-xs"
                  style={{
                    left: Math.min(window.innerWidth - 208, Math.max(12, tabCtx.x)),
                    top: Math.min(window.innerHeight - 180, Math.max(48, tabCtx.y + 4)),
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      togglePinTab(targetTab.id);
                      setTabCtx(null);
                    }}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-black/5 cursor-pointer"
                  >
                    <Pin size={12} />
                    <span>{targetTab.pinned ? '取消置顶' : '置顶此标签页'}</span>
                  </button>
                  <div className="h-px my-0.5" style={{ background: 'var(--border)' }} />
                  <button
                    type="button"
                    onClick={() => {
                      closeTab(targetTab.id, true);
                      setTabCtx(null);
                    }}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-black/5 cursor-pointer"
                  >
                    <X size={12} />
                    <span>关闭此标签页</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeOtherUnpinnedTabs(targetTab.id);
                      setTabCtx(null);
                    }}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-black/5 cursor-pointer"
                  >
                    <Ban size={12} />
                    <span>关闭其他未置顶标签</span>
                  </button>
                  <div className="h-px my-0.5" style={{ background: 'var(--border)' }} />
                  <button
                    type="button"
                    onClick={() => {
                      restoreDefaultTabs();
                      setTabCtx(null);
                    }}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-black/5 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>恢复默认工作区 Tab</span>
                  </button>
                </div>
              </>
            );
          })()}

        {/* Live Draft Semantic Diff Chip */}
        {activeDiff?.hasChanges && (
          <div
            className="studio-island hidden xl:inline-flex items-center gap-1.5 px-2.5 h-[34px] text-[11px] font-mono shrink-0"
            style={{
              color: 'var(--amber)',
              borderColor: 'var(--amber-border)',
              background: 'var(--amber-soft)',
            }}
          >
            <span>草稿</span>
            {activeDiff.statesAdded.length > 0 && <span>+{activeDiff.statesAdded.length}态</span>}
            {activeDiff.transitionsAdded.length > 0 && (
              <span>+{activeDiff.transitionsAdded.length}边</span>
            )}
            {activeDiff.statesRenamed.length + activeDiff.transitionsModified.length > 0 && (
              <span>
                ~{activeDiff.statesRenamed.length + activeDiff.transitionsModified.length}改
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top-Right Dock: Custom Workspace Pill + Clickable Linter Pill + Worldline + Undo/Redo + ⌘K */}
      <div className="fixed top-3 right-3 z-30 flex items-center gap-1.5">
        <div className="studio-island relative flex items-center gap-1 p-[3px] text-xs">
          {/* Custom Workspace Pill */}
          <button
            type="button"
            onClick={() => {
              setWsOpen(!wsOpen);
              setLinterOpen(false);
            }}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md font-mono text-[11px] font-semibold cursor-pointer hover:bg-black/5"
            style={{ color: 'var(--ink)' }}
            title="切换工作区或 Git Worktree"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: activeWorkspace?.protected ? 'var(--amber)' : 'var(--green)' }}
            />
            <GitBranch size={12} style={{ color: 'var(--text-muted)' }} />
            <span className="max-w-[190px] truncate">
              {activeWorkspace ? `${activeWorkspace.repo} · ${activeWorkspace.branch}` : '加载中'}
            </span>
            <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
          </button>

          {/* Grouped Workspace Popover */}
          {wsOpen && (
            <div className="studio-float absolute right-0 top-10 w-80 p-2 z-50 text-xs">
              <div
                className="px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center justify-between"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>工作区与 Git Worktree</span>
                <span>{allWorkspaceEntries.length}</span>
              </div>
              <div className="flex flex-col gap-1 mt-1 max-h-60 overflow-y-auto">
                {allWorkspaceEntries.map((ws) => {
                  const isActive = ws.wsKey === activeWorkspace?.wsKey;
                  return (
                    <button
                      key={ws.wsKey}
                      type="button"
                      onClick={() => {
                        setWsOpen(false);
                        if (!isActive) void switchWorkspace(ws.wsKey);
                      }}
                      className="w-full text-left rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                      style={{
                        borderColor: isActive ? 'var(--ink)' : 'var(--border)',
                        background: isActive ? 'var(--surface-subtle)' : 'var(--surface)',
                      }}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold text-[11.5px] truncate flex items-center gap-1.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: ws.protected ? 'var(--amber)' : 'var(--green)' }}
                          />
                          <span>{ws.repo}</span>
                          <span style={{ color: 'var(--text-muted)' }}>· {ws.branch}</span>
                        </div>
                        <div
                          className="text-[10px] mt-0.5 truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {ws.specCount} 份规格 · {ws.instanceRel}
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: ws.protected ? 'var(--amber-soft)' : 'var(--green-soft)',
                          color: ws.protected ? 'var(--amber)' : 'var(--green)',
                        }}
                      >
                        {ws.protected ? '写保护' : '可直写'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save Status Indicator (hidden on + Start Page) */}
          {!isStartPage && saveStatus !== 'idle' && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background:
                  saveStatus === 'conflict' || saveStatus === 'error'
                    ? 'var(--red-soft)'
                    : 'var(--surface-subtle)',
                color:
                  saveStatus === 'conflict' || saveStatus === 'error'
                    ? 'var(--red)'
                    : 'var(--text-muted)',
              }}
            >
              {saveStatus === 'saving'
                ? '保存中'
                : saveStatus === 'conflict'
                  ? '并发冲突'
                  : saveStatus === 'error'
                    ? '保存失败'
                    : '已保存'}
            </span>
          )}

          {/* Clickable Linter Pill + Interactive Diagnostic Popover */}
          {activeMachineKey && (
            <button
              type="button"
              onClick={() => {
                setLinterOpen(!linterOpen);
                setWsOpen(false);
              }}
              className="inline-flex items-center gap-1 h-7 rounded-md px-2 text-[11.5px] font-semibold border cursor-pointer transition-colors"
              style={{
                background:
                  errCount > 0
                    ? 'var(--red-soft)'
                    : warnCount > 0
                      ? 'var(--amber-soft)'
                      : 'var(--green-soft)',
                borderColor:
                  errCount > 0
                    ? 'var(--red-border)'
                    : warnCount > 0
                      ? 'var(--amber-border)'
                      : 'var(--green-border)',
                color:
                  errCount > 0 ? 'var(--red)' : warnCount > 0 ? 'var(--amber)' : 'var(--green)',
              }}
            >
              {errCount > 0 || warnCount > 0 ? (
                <AlertTriangle size={12} />
              ) : (
                <CheckCircle2 size={12} />
              )}
              <span>
                {errCount > 0
                  ? `${String(errCount)} 错${warnCount > 0 ? ` · ${String(warnCount)} 警` : ''}`
                  : warnCount > 0
                    ? `${String(warnCount)} 警`
                    : '校验通过'}
              </span>
            </button>
          )}

          {linterOpen && activeMachineKey && (
            <div className="studio-float absolute right-0 top-10 w-[340px] z-50 overflow-hidden text-xs">
              <div
                className="px-3 py-2 border-b flex items-center justify-between"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
              >
                <div className="inline-flex items-center gap-1.5 font-semibold">
                  <Shield size={12} />
                  <span>图门禁诊断 · {activeMachineKey}</span>
                </div>
                <div className="inline-flex items-center gap-1">
                  {(['all', 'error', 'warning'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setLintFilter(f)}
                      className="rounded px-1.5 py-0.5 text-[10px] cursor-pointer"
                      style={{
                        background: lintFilter === f ? 'var(--ink)' : 'transparent',
                        color: lintFilter === f ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {f === 'all' ? '全部' : f === 'error' ? '错误' : '警告'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredDiags.length === 0 ? (
                  <div className="p-4 text-center" style={{ color: 'var(--green)' }}>
                    当前状态机已通过全部 E1–E4 / W1–W2 校验
                  </div>
                ) : (
                  filteredDiags.map((d, i) => (
                    <div
                      key={`${d.code}-${String(i)}`}
                      className="px-3 py-2 border-b last:border-b-0 flex items-start justify-between gap-2 hover:bg-black/[0.02]"
                      style={{ borderColor: 'var(--surface-subtle)' }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              background:
                                d.severity === 'error' ? 'var(--red-soft)' : 'var(--amber-soft)',
                              color: d.severity === 'error' ? 'var(--red)' : 'var(--amber)',
                            }}
                          >
                            {d.code}
                          </span>
                          <span className="text-[11.5px] leading-snug">{d.message}</span>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 shrink-0">
                        {d.targetKind === 'state' && d.targetId && (
                          <button
                            type="button"
                            title="在画布定位该节点"
                            onClick={() => {
                              setFocusStateUid(d.targetId);
                              setLinterOpen(false);
                            }}
                            className="p-1 rounded hover:bg-black/5 cursor-pointer"
                          >
                            <Crosshair size={12} />
                          </button>
                        )}
                        {d.fixable === 'delete-edge' && d.targetId && (
                          <button
                            type="button"
                            title="一键删除冲突重复边"
                            onClick={() => deleteEdge(activeMachineKey, d.targetId!)}
                            className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-black/5"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            <Wrench size={10} />
                            <span>修复</span>
                          </button>
                        )}
                        {d.code === 'E3' &&
                          d.targetKind === 'state' &&
                          d.targetId &&
                          activeDraft?.current?.states[0] && (
                            <button
                              type="button"
                              title="一键从初态连线接入"
                              onClick={() => {
                                const initUid =
                                  activeDraft.current?.initialStateUid ??
                                  activeDraft.current?.states[0]?.uid;
                                if (initUid && d.targetId && initUid !== d.targetId) {
                                  connectStates(activeMachineKey, initUid, d.targetId, '接入');
                                }
                              }}
                              className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-black/5"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              <Wrench size={10} />
                              <span>修复</span>
                            </button>
                          )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Worldline Trigger (Axiom 1 Right-Anchor) + Undo/Redo + ⌘K — omitted on + Start Page (demo parity!) */}
        {!isStartPage && (
          <div className="studio-island flex items-center gap-0.5 p-[3px] text-xs">
            <button
              type="button"
              onClick={() => setWorldlineOpen(!worldlineOpen)}
              className="inline-flex items-center gap-1.5 h-7 rounded-md px-2.5 text-[12px] font-medium cursor-pointer transition-colors"
              style={{
                background: worldlineOpen ? 'var(--ink)' : 'transparent',
                color: worldlineOpen ? '#ffffff' : 'var(--ink)',
              }}
            >
              <Clock size={13} />
              <span>世界线</span>
              {wlCount > 0 && (
                <span
                  className="font-mono text-[10px] rounded px-1"
                  style={{
                    background: worldlineOpen ? 'rgba(255,255,255,0.2)' : 'var(--surface-subtle)',
                  }}
                >
                  {wlCount}
                </span>
              )}
            </button>

            <button
              type="button"
              title="撤销 (⌘Z)"
              disabled={!canUndo}
              onClick={undoActiveMachine}
              className="w-7 h-7 inline-flex items-center justify-center rounded-md disabled:opacity-35 hover:bg-black/5 cursor-pointer"
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              title="重做 (⌘⇧Z)"
              disabled={!canRedo}
              onClick={redoActiveMachine}
              className="w-7 h-7 inline-flex items-center justify-center rounded-md disabled:opacity-35 hover:bg-black/5 cursor-pointer"
            >
              <Redo2 size={13} />
            </button>

            <div className="w-px h-3.5 mx-0.5" style={{ background: 'var(--border)' }} />

            <button
              type="button"
              onClick={() => setCmdkOpen(true)}
              title="全局搜索与命令 (⌘K)"
              className="inline-flex items-center gap-1 h-7 rounded-md px-2 font-mono text-[11px] font-semibold cursor-pointer hover:bg-black/5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>⌘K</span>
            </button>
          </div>
        )}
      </div>

      {renderTopCenterHud()}
    </>
  );
}
