/**
 * Bottom Chrome (Demo Visual Craft):
 * - Bottom-Left: Tinted Legend with counts (Main & Machine views) + Integrated Zoom/Fit + Tier + 4-Group Settings SSOT
 * - Bottom-Center (Context-Pure):
 *   * Doc View: Signature Warm-Cream 5-Level TextFold Capsule (全文 › 简述 › 关键句 › 要点 › 主题)
 *   * Simulate Mode: Clickable outgoing event CTA pills + guard switches + terminal badge
 *   * Machine View: 单步试跑 + 协商建议(N) + 变更依赖 + 生成调整 Prompt + 保存变更
 *   * Main View: Clean minimal contextual actions
 */
import {
  CircleDot,
  Compass,
  Diamond,
  Download,
  FileText,
  GitMerge,
  GitPullRequest,
  Keyboard,
  Maximize2,
  Minus,
  Network,
  Play,
  Plus,
  Save,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Table2,
  Target,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';

import {
  exportStudioCanvasSnapshot,
  type SnapshotFormat,
  type SnapshotScope,
} from '../ergonomics/exportSnapshot.ts';
import type { EdgePreset } from '../routing/obstacleRouter.ts';
import { useStudioStore, type CardTier, type StudioSkin } from '../store/studioStore.ts';

const TEXTFOLD_LABELS: Array<{ level: 0 | 1 | 2 | 3 | 4; label: string }> = [
  { level: 0, label: '全文' },
  { level: 1, label: '简述' },
  { level: 2, label: '关键句' },
  { level: 3, label: '要点' },
  { level: 4, label: '主题' },
];

export function BottomChrome() {
  const {
    tabs,
    activeTabId,
    specs,
    stateDoc,
    tier,
    skin,
    edgePreset,
    showMinimap,
    showLegend,
    legendKindFilter,
    textfoldEndpoint,
    settingsOpen,
    docFoldLevel,
    zoomPercent,
    mode,
    simSession,
    simGuards,
    focusAdjacencyCapId,
    setTier,
    setSkin,
    setEdgePreset,
    setShowMinimap,
    setShowLegend,
    toggleLegendKind,
    setTextfoldEndpoint,
    setSettingsOpen,
    setShortcutsOpen,
    startTour,
    showToast,
    setDocFoldLevel,
    triggerZoom,
    setDagPanelOpen,
    setRevisionDrawerOpen,
    setSaveModalOpen,
    openShareModal,
    startSimulation,
    stopSimulation,
    triggerSimEvent,
    toggleSimGuard,
    openPromptWorkbench,
    buildNegotiationPrompt,
    updateActiveForestView,
    setFocusAdjacencyCapId,
    getActiveForestView,
    getActiveMachineKey,
  } = useStudioStore();

  const [tfMode, setTfMode] = useState<'local' | 'serve'>(textfoldEndpoint ? 'serve' : 'local');
  const [exportScope, setExportScope] = useState<SnapshotScope>('canvas');
  const [exportHeader, setExportHeader] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  const handleExport = async (format: SnapshotFormat): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    try {
      const active = tabs.find((t) => t.id === activeTabId);
      const res = await exportStudioCanvasSnapshot({
        format,
        scope: exportScope,
        includeHeader: exportHeader,
        skin,
        title: active?.title ?? '主视图',
      });
      showToast(`已导出只读快照：${res.filename}`);
    } catch (error) {
      showToast(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);
  // Context-Aware Chrome (matching studio-demo.html): hide all bottom canvas controls on + New Tab page!
  if (activeTab?.kind === 'new-tab') return null;

  const isForestView = activeTab?.kind === 'macro' || activeTab?.kind === 'forest';
  const activeForestView = getActiveForestView();
  const activeMachineKey = getActiveMachineKey();
  const pendingRevisions = (stateDoc?.revisions ?? []).filter((r) => r.status === 'pending');
  const openCommentsCount = (stateDoc?.comments ?? []).filter((c) => c.status === 'open').length;

  const kindCounts = {
    machine: specs.filter((s) => s.kind === 'machine').length,
    flow: specs.filter((s) => s.kind === 'flow').length,
    decision: specs.filter((s) => s.kind === 'decision').length,
    doc: specs.filter((s) => s.kind === 'doc').length,
  };

  const legendItems = [
    { kind: 'machine' as const, label: '状态机', Icon: Workflow, count: kindCounts.machine },
    { kind: 'flow' as const, label: '流程图', Icon: GitMerge, count: kindCounts.flow },
    { kind: 'decision' as const, label: '决策表', Icon: Table2, count: kindCounts.decision },
    { kind: 'doc' as const, label: '规则', Icon: FileText, count: kindCounts.doc },
  ];

  const outgoingSimTransitions =
    mode === 'simulate' && simSession ? simSession.availableTransitions() : [];

  return (
    <>
      {/* Bottom-Left Stack: Tinted Legend + Integrated Zoom/Fit + Tier + Settings SSOT */}
      <div className="fixed bottom-3 left-3 z-30 flex flex-col items-start gap-2">
        {showLegend && isForestView && (
          <div className="studio-island flex items-center gap-1 px-2 py-1 text-[11px]">
            {legendItems.map(({ kind, label, Icon, count }) => {
              const on = legendKindFilter.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleLegendKind(kind)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 cursor-pointer transition-opacity"
                  style={{
                    opacity: on ? 1 : 0.38,
                    background: on ? 'var(--surface-subtle)' : 'transparent',
                    color: 'var(--ink)',
                  }}
                >
                  <span className={`type-icon-box ${kind} w-[18px] h-[18px]`}>
                    <Icon size={11} />
                  </span>
                  <span className="font-medium">{label}</span>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {showLegend && activeTab?.kind === 'machine' && (
          <div
            className="studio-island flex items-center gap-2.5 px-2.5 py-1 text-[11px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="inline-flex items-center gap-1">
              <Play size={11} style={{ color: 'var(--ink)' }} />
              <span>初态</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <CircleDot size={11} style={{ color: 'var(--accent)' }} />
              <span>状态</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Target size={11} style={{ color: 'var(--t-machine)' }} />
              <span>终态</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Diamond size={11} style={{ color: 'var(--t-flow)' }} />
              <span>条件判断</span>
            </span>
          </div>
        )}

        <div className="relative flex items-center gap-1 studio-island p-[3px] text-xs">
          {/* Integrated Zoom & Fit (replaces raw bottom-right React Flow Controls!) */}
          {activeTab?.kind !== 'doc' && (
            <>
              <button
                type="button"
                title="缩小"
                onClick={() => triggerZoom('out')}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-black/5 cursor-pointer"
              >
                <Minus size={12} />
              </button>
              <button
                type="button"
                title="适配画布"
                onClick={() => triggerZoom('fit')}
                className="h-7 px-1.5 rounded-md font-mono text-[11px] font-semibold hover:bg-black/5 cursor-pointer min-w-[44px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {zoomPercent}%
              </button>
              <button
                type="button"
                title="放大"
                onClick={() => triggerZoom('in')}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-black/5 cursor-pointer"
              >
                <Plus size={12} />
              </button>
              <button
                type="button"
                title="一键适配全图"
                onClick={() => triggerZoom('fit')}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-black/5 cursor-pointer"
              >
                <Maximize2 size={11} />
              </button>
              <div className="w-px h-3.5 mx-0.5" style={{ background: 'var(--border)' }} />
            </>
          )}

          {/* 3-Tier Visual Density Switcher */}
          {activeTab?.kind !== 'doc' && (
            <div
              className="inline-flex items-center rounded-md p-0.5"
              style={{ background: 'var(--surface-subtle)' }}
            >
              {(
                [
                  ['glyph', '图标'],
                  ['map', '摘要'],
                  ['detail', '详情'],
                ] as Array<[CardTier, string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTier(k)}
                  className="rounded px-2 py-0.5 text-[11px] cursor-pointer transition-colors"
                  style={{
                    background: tier === k ? 'var(--surface)' : 'transparent',
                    color: tier === k ? 'var(--ink)' : 'var(--text-muted)',
                    fontWeight: tier === k ? 600 : 400,
                    boxShadow: tier === k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="inline-flex items-center gap-1 h-7 rounded-md px-2 text-xs cursor-pointer hover:bg-black/5"
              style={{
                background: settingsOpen ? 'var(--accent-soft)' : 'transparent',
                color: settingsOpen ? 'var(--accent)' : 'var(--ink)',
              }}
            >
              <SlidersHorizontal size={12} />
              <span>画布</span>
            </button>

            {/* 4-Group Simplified Settings SSOT Popover (Proximity Anchor: right-aligned directly above 「画布」 trigger!) */}
            {settingsOpen && (
              <div className="studio-float absolute bottom-10 right-0 w-76 p-3.5 flex flex-col gap-3.5 text-xs z-50">
                <div className="font-semibold text-[12px]">画布设置</div>

                <div>
                  <div className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    主题风格
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['linear', 'Linear 冷静灰', ['#f5f6f8', '#ffffff', '#2f54eb', '#0d7a6c']],
                        ['washi', '和纸暖墨', ['#f9f8f4', '#f7f4ec', '#b54116', '#476f16']],
                      ] as Array<[StudioSkin, string, string[]]>
                    ).map(([val, label, swatches]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSkin(val)}
                        className="rounded-lg border px-2.5 py-2 text-left cursor-pointer flex flex-col gap-1.5"
                        style={{
                          borderColor: skin === val ? 'var(--ink)' : 'var(--border)',
                          background: skin === val ? 'var(--surface-subtle)' : 'var(--surface)',
                        }}
                      >
                        <span className="font-medium text-[11.5px]">{label}</span>
                        <span className="inline-flex items-center gap-1">
                          {swatches.map((hex) => (
                            <span
                              key={hex}
                              className="w-3.5 h-3.5 rounded-full border"
                              style={{ background: hex, borderColor: 'rgba(0,0,0,0.12)' }}
                            />
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    连线样式
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['bezier', '曲线'],
                        ['smoothstep', '折线'],
                        ['straight', '直线'],
                      ] as Array<[EdgePreset, string]>
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEdgePreset(val)}
                        className="rounded-md border px-2 py-1 text-center cursor-pointer font-medium"
                        style={{
                          borderColor: edgePreset === val ? 'var(--ink)' : 'var(--border)',
                          background: edgePreset === val ? 'var(--ink)' : 'var(--surface)',
                          color: edgePreset === val ? '#ffffff' : 'var(--text-secondary)',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    界面组件
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowMinimap(!showMinimap)}
                      className="inline-flex items-center justify-between rounded-md border px-2.5 py-1.5 cursor-pointer"
                      style={{
                        borderColor: showMinimap ? 'var(--ink)' : 'var(--border)',
                        background: showMinimap ? 'var(--ink)' : 'var(--surface)',
                        color: showMinimap ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      <span>小地图</span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: showMinimap ? '#4ade80' : 'var(--border-strong)' }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLegend(!showLegend)}
                      className="inline-flex items-center justify-between rounded-md border px-2.5 py-1.5 cursor-pointer"
                      style={{
                        borderColor: showLegend ? 'var(--ink)' : 'var(--border)',
                        background: showLegend ? 'var(--ink)' : 'var(--surface)',
                        color: showLegend ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      <span>图例筛选</span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: showLegend ? '#4ade80' : 'var(--border-strong)' }}
                      />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      文档折展引擎
                    </span>
                    <div
                      className="inline-flex rounded p-0.5 text-[10.5px]"
                      style={{ background: 'var(--surface-subtle)' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setTfMode('local');
                          setTextfoldEndpoint('');
                        }}
                        className="rounded px-2 py-0.5 cursor-pointer"
                        style={{
                          background: tfMode === 'local' ? 'var(--surface)' : 'transparent',
                          fontWeight: tfMode === 'local' ? 600 : 400,
                        }}
                      >
                        内置折展
                      </button>
                      <button
                        type="button"
                        onClick={() => setTfMode('serve')}
                        className="rounded px-2 py-0.5 cursor-pointer"
                        style={{
                          background: tfMode === 'serve' ? 'var(--surface)' : 'transparent',
                          fontWeight: tfMode === 'serve' ? 600 : 400,
                        }}
                      >
                        本机 Serve
                      </button>
                    </div>
                  </div>
                  {tfMode === 'serve' && (
                    <input
                      type="url"
                      value={textfoldEndpoint}
                      onChange={(e) => setTextfoldEndpoint(e.target.value)}
                      placeholder="http://127.0.0.1:8765"
                      className="w-full rounded-md border px-2 py-1 font-mono text-[11px] outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
                    />
                  )}
                </div>

                {activeTab?.kind !== 'doc' && (
                  <div
                    className="pt-2 border-t flex flex-col gap-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        只读快照导出
                      </span>
                      <div
                        className="inline-flex rounded p-0.5 text-[10.5px]"
                        style={{ background: 'var(--surface-subtle)' }}
                      >
                        {(
                          [
                            ['canvas', '整张画布'],
                            ['selected', '当前选中'],
                          ] as const
                        ).map(([sc, lbl]) => (
                          <button
                            key={sc}
                            type="button"
                            onClick={() => setExportScope(sc)}
                            className="rounded px-2 py-0.5 cursor-pointer"
                            style={{
                              background: exportScope === sc ? 'var(--surface)' : 'transparent',
                              fontWeight: exportScope === sc ? 600 : 400,
                            }}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label
                      className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <input
                        type="checkbox"
                        checked={exportHeader}
                        onChange={(e) => setExportHeader(e.target.checked)}
                      />
                      <span>附带标题栏</span>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={() => void handleExport('svg')}
                        className="inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 cursor-pointer hover:bg-black/5"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <Download size={11} />
                        <span>导出 SVG</span>
                      </button>
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={() => void handleExport('png')}
                        className="inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 cursor-pointer hover:bg-black/5"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <Download size={11} />
                        <span>导出 PNG</span>
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className="pt-2 border-t grid grid-cols-2 gap-1.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={startTour}
                    className="inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 cursor-pointer hover:bg-black/5"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <Compass size={11} />
                    <span>交互式向导</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      setShortcutsOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 cursor-pointer hover:bg-black/5"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <Keyboard size={11} />
                    <span>快捷键 (?)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom-Center Contextual Action Dock (Context-Pure!) */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 studio-island flex items-center gap-1.5 px-2 py-1 text-xs">
        {mode === 'simulate' ? (
          <>
            {outgoingSimTransitions.length === 0 ? (
              <span
                className="rounded px-2 py-1 text-[11px] font-semibold"
                style={{ background: 'var(--green-soft)', color: 'var(--green)' }}
              >
                已到达终态
              </span>
            ) : (
              outgoingSimTransitions.map((tr) => (
                <button
                  key={tr.edgeUid}
                  type="button"
                  onClick={() => triggerSimEvent(tr.event)}
                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11.5px] font-medium cursor-pointer transition-colors"
                  style={{
                    borderColor: tr.guardSatisfied ? 'var(--accent)' : 'var(--border)',
                    background: tr.guardSatisfied ? 'var(--accent-soft)' : 'var(--surface-subtle)',
                    color: tr.guardSatisfied ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  <Play size={10} />
                  <span>
                    {tr.event}
                    {tr.guard ? ` [${tr.guard}]` : ''}
                  </span>
                </button>
              ))
            )}
            {Object.keys(simGuards).length > 0 && (
              <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border)' }} />
            )}
            {Object.entries(simGuards).map(([gName, val]) => (
              <label
                key={gName}
                className="inline-flex items-center gap-1 rounded px-2 py-1 cursor-pointer text-[11px]"
                style={{ background: 'var(--surface-subtle)' }}
              >
                <input type="checkbox" checked={val} onChange={() => toggleSimGuard(gName)} />
                <span className="font-mono">{gName}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={stopSimulation}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <Square size={11} />
              <span>退出试跑</span>
            </button>
          </>
        ) : activeTab?.kind === 'doc' ? (
          <>
            {/* Signature Warm-Cream 5-Level TextFold Capsule */}
            <div
              className="inline-flex items-center rounded-md p-0.5"
              style={{ background: 'var(--paper-warm)', border: '1px solid var(--paper-border)' }}
            >
              {TEXTFOLD_LABELS.map(({ level, label }) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDocFoldLevel(level)}
                  className="rounded px-2 py-0.5 text-[11px] cursor-pointer transition-colors"
                  style={{
                    background: docFoldLevel === level ? 'var(--ink)' : 'transparent',
                    color: docFoldLevel === level ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: docFoldLevel === level ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border)' }} />
            <button
              type="button"
              onClick={() =>
                openShareModal({
                  kind: 'doc',
                  targetId: activeTab.targetId,
                  title: activeTab.title,
                })
              }
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer hover:bg-black/5"
            >
              <Share2 size={12} />
              <span>分享状态</span>
            </button>
            <button
              type="button"
              onClick={() => setSaveModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <Save size={12} />
              <span>保存变更</span>
            </button>
          </>
        ) : activeMachineKey ? (
          <>
            <button
              type="button"
              onClick={() => startSimulation(activeMachineKey)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 cursor-pointer hover:bg-black/5 font-medium"
            >
              <Play size={12} />
              <span>单步试跑</span>
            </button>
            {pendingRevisions.length > 0 && (
              <button
                type="button"
                onClick={() => setRevisionDrawerOpen(true)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 cursor-pointer font-medium"
                style={{ background: 'var(--green-soft)', color: 'var(--green)' }}
              >
                <GitPullRequest size={12} />
                <span>协商建议 ({pendingRevisions.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setDagPanelOpen(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer hover:bg-black/5"
            >
              <Network size={12} />
              <span>变更依赖</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openPromptWorkbench(
                  '生成调整 Prompt',
                  '检查并按需补充上下文后复制给你的编码 Agent',
                  buildNegotiationPrompt(activeMachineKey),
                )
              }
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 cursor-pointer hover:bg-black/5"
            >
              <Sparkles size={12} />
              <span>生成调整 Prompt</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openPromptWorkbench(
                  '生成调整 Prompt',
                  '只带我勾的看法',
                  buildNegotiationPrompt(activeMachineKey),
                )
              }
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer hover:bg-black/5"
            >
              <span>只带我勾的看法</span>
            </button>
            <button
              type="button"
              onClick={() => setSaveModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <Save size={12} />
              <span>保存变更</span>
            </button>
          </>
        ) : (
          /* Clean Main / Custom Forest View Dock */
          <>
            {activeTab?.kind === 'forest' && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    updateActiveForestView({
                      showExternalHops: !activeForestView.showExternalHops,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] cursor-pointer"
                  style={{
                    borderColor: activeForestView.showExternalHops
                      ? 'var(--accent)'
                      : 'var(--border)',
                    background: activeForestView.showExternalHops
                      ? 'var(--accent-soft)'
                      : 'transparent',
                    color: activeForestView.showExternalHops
                      ? 'var(--accent)'
                      : 'var(--text-secondary)',
                  }}
                >
                  <span>+ 外部 1 跳接口</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateActiveForestView({ bridgeOnly: !activeForestView.bridgeOnly })
                  }
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] cursor-pointer"
                  style={{
                    borderColor: activeForestView.bridgeOnly ? 'var(--ink)' : 'var(--border)',
                    background: activeForestView.bridgeOnly ? 'var(--ink)' : 'transparent',
                    color: activeForestView.bridgeOnly ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  <span>交叉桥</span>
                </button>
                <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border)' }} />
              </>
            )}
            {focusAdjacencyCapId && (
              <button
                type="button"
                onClick={() => setFocusAdjacencyCapId(null)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] cursor-pointer"
                style={{
                  borderColor: 'var(--accent)',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
              >
                <span>+ 展开其余非邻接节点</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setDagPanelOpen(true)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 cursor-pointer hover:bg-black/5"
            >
              <Network size={12} />
              <span>变更依赖</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openShareModal({ kind: 'macro', targetId: 'default', title: '主视图' })
              }
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 cursor-pointer hover:bg-black/5"
            >
              <Share2 size={12} />
              <span>分享状态</span>
            </button>
            {(openCommentsCount > 0 || pendingRevisions.length > 0) && (
              <>
                <div className="w-px h-4 mx-0.5" style={{ background: 'var(--border)' }} />
                <button
                  type="button"
                  onClick={() =>
                    openPromptWorkbench(
                      '生成调整 Prompt',
                      '汇总当前未解决评论与草稿上下文',
                      buildNegotiationPrompt(),
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium cursor-pointer"
                  style={{ background: 'var(--ink)', color: '#ffffff' }}
                >
                  <Sparkles size={12} />
                  <span>生成调整 Prompt ({openCommentsCount})</span>
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
