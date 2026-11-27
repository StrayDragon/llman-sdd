/**
 * Modals, Drawers & Palettes (Demo Visual Craft):
 * - PromptWorkbenchModal: quick-insert constraint chips, ~N tok estimator, ⌘+Enter copy
 * - SaveGuardModal: Scheme C 3-exit protected branch wizard + Unified Diff + proposal.md export
 * - ShareDeepLinkModal: 3-Tab live preview (Markdown | JSON | HTML)
 * - SearchPaletteModal: scope tabs (全部 | 规格与图 | 操作命令) + state-level indexing
 * - RevisionDrawer: Agent negotiation proposal accept / reject panel
 */
import type { StudioSearchHit } from '@llman-sdd/core/studio';
import { Command } from 'cmdk';
import {
  Check,
  Copy,
  FileCode2,
  GitBranch,
  GitPullRequest,
  Maximize2,
  Minimize2,
  Network,
  Save,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { studioApi } from '../api/client.ts';
import { useStudioStore } from '../store/studioStore.ts';

const PROMPT_QUICK_CHIPS = [
  { label: '+ 补充约束', snippet: '\n- 补充约束：保持向后兼容，不得破坏既有规格契约。' },
  { label: '+ 验收标准', snippet: '\n- 验收标准：补齐对应 BDD / 单元测试并确保 just qa 全绿。' },
  { label: '+ 关联文件', snippet: '\n- 重点关注文件：llmanspec/specs/ 与 packages/core/src/。' },
  { label: '+ 强调风险', snippet: '\n- 风险提示：注意并发锁与边界条件，先给 diff 预览再落盘。' },
];

export function PromptWorkbenchModal() {
  const { promptModal, closePromptWorkbench, togglePromptFullscreen, showToast } = useStudioStore();
  const [text, setText] = useState('');

  useEffect(() => {
    if (promptModal) setText(promptModal.body);
  }, [promptModal]);

  if (!promptModal) return null;

  const isEdited = text !== promptModal.body;
  const estTokens = Math.max(1, Math.round(text.length / 2.2));

  const copyAndClose = (): void => {
    void navigator.clipboard?.writeText(text);
    showToast('已复制 Prompt 到剪贴板');
    closePromptWorkbench();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6"
      onClick={closePromptWorkbench}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="studio-float flex flex-col overflow-hidden"
        style={{
          width: promptModal.fullscreen ? '94vw' : 'min(760px, 92vw)',
          height: promptModal.fullscreen ? '90vh' : 'min(590px, 84vh)',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>{promptModal.title}</span>
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: isEdited ? 'var(--amber-soft)' : 'var(--surface)',
                    color: isEdited ? 'var(--amber)' : 'var(--text-muted)',
                  }}
                >
                  {isEdited ? '已自定义' : '原文预览'}
                </span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {promptModal.subtitle}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={togglePromptFullscreen}
              className="p-1.5 rounded hover:bg-black/5 cursor-pointer"
              title="全屏切换"
            >
              {promptModal.fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              type="button"
              onClick={closePromptWorkbench}
              className="p-1.5 rounded hover:bg-black/5 cursor-pointer"
              title="关闭"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Quick-Insert Constraint Chips */}
        <div
          className="px-4 py-2 border-b flex items-center gap-1.5 flex-wrap text-[11px]"
          style={{ borderColor: 'var(--border)', background: 'var(--paper-warm)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>快捷追加：</span>
          {PROMPT_QUICK_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setText((prev) => `${prev}${chip.snippet}`)}
              className="rounded-full border px-2.5 py-0.5 cursor-pointer hover:bg-black/5"
              style={{ borderColor: 'var(--paper-border)', background: 'var(--surface)' }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              copyAndClose();
            }
          }}
          className="flex-1 w-full p-4 font-mono text-xs leading-relaxed outline-none resize-none"
          style={{ background: 'var(--surface)', color: 'var(--ink)' }}
        />

        <div
          className="flex items-center justify-between px-4 py-2.5 border-t text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
        >
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {text.length} 字符 · ~{estTokens} tok · ⌘+Enter 快捷复制
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setText(promptModal.body)}
              className="rounded-md border px-3 py-1.5 cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              恢复原文
            </button>
            <button
              type="button"
              onClick={copyAndClose}
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <Copy size={12} />
              <span>确认并复制 Prompt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SaveGuardModal() {
  const {
    saveModalOpen,
    activeWorkspace,
    stateDoc,
    peerWorktrees,
    setSaveModalOpen,
    flushPendingSaves,
    switchWorkspace,
    openPromptWorkbench,
    buildNegotiationPrompt,
    showToast,
  } = useStudioStore();
  const [changeId, setChangeId] = useState('refine-studio-spec');
  const [title, setTitle] = useState('更新规格定义');
  const [why, setWhy] = useState('基于 Studio 审阅与可视化草稿导出提案');
  const [diffText, setDiffText] = useState<string | null>(null);

  if (!saveModalOpen || !activeWorkspace || !stateDoc) return null;

  const loadPreview = async (): Promise<void> => {
    await flushPendingSaves();
    try {
      const res = await studioApi.previewDiff(stateDoc.id, activeWorkspace.wsKey);
      setDiffText(res.diffs.map((d) => d.unifiedDiff).join('\n\n') || '暂无待写入的状态机行级差异');
    } catch (error) {
      setDiffText(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExport = async (): Promise<void> => {
    await flushPendingSaves();
    try {
      const res = await studioApi.exportProposal(
        stateDoc.id,
        { changeId, title, why },
        activeWorkspace.wsKey,
      );
      showToast(`已导出提案至 ${res.proposalPath}`);
      setSaveModalOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出提案失败');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6"
      onClick={() => setSaveModalOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="studio-float w-[600px] max-w-[92vw] p-5 flex flex-col gap-4 text-xs"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Save size={15} />
            <span>保存变更 · 分支写保护与 Scheme C 分流</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveModalOpen(false)}
            className="p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{
            borderColor: activeWorkspace.protected ? 'var(--amber-border)' : 'var(--green-border)',
            background: activeWorkspace.protected ? 'var(--amber-soft)' : 'var(--green-soft)',
          }}
        >
          <div className="font-semibold">
            当前分支：{activeWorkspace.branch}（
            {activeWorkspace.protected ? '受保护主干分支' : '特性分支'}）
          </div>
          <div className="mt-1" style={{ color: 'var(--text-secondary)' }}>
            {activeWorkspace.protected
              ? '受保护主干禁止直接改写 llmanspec/specs/。请选择下方三个安全出口之一：切至可写 Worktree、生成调整 Prompt 交 Agent 开分支、或导出 proposal.md。'
              : '特性分支可通过 llman-sdd studio apply 安全落盘，或先预览 Unified Diff / 导出 proposal.md。'}
          </div>
        </div>

        {peerWorktrees.filter((w) => !w.protected).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color: 'var(--text-muted)' }}>出口 1 · 切至可写 Worktree：</span>
            {peerWorktrees
              .filter((w) => !w.protected)
              .map((pw) => (
                <button
                  key={pw.wsKey}
                  type="button"
                  onClick={() => {
                    setSaveModalOpen(false);
                    void switchWorkspace(pw.wsKey);
                  }}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 cursor-pointer"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  <GitBranch size={11} />
                  <span>{pw.branch}</span>
                </button>
              ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <input
            value={changeId}
            onChange={(e) => setChangeId(e.target.value)}
            placeholder="change-id (kebab-case)"
            className="rounded border px-2.5 py-1.5 font-mono text-xs"
            style={{ borderColor: 'var(--border)' }}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="提案标题"
            className="rounded border px-2.5 py-1.5 text-xs"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>
        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="变更动机 (Why)"
          className="rounded border px-2.5 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)' }}
        />

        {diffText !== null && (
          <pre
            className="max-h-40 overflow-auto rounded border p-2.5 font-mono text-[11px]"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
          >
            {diffText}
          </pre>
        )}

        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => void loadPreview()}
            className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
          >
            <FileCode2 size={12} />
            <span>预览 Unified Diff</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSaveModalOpen(false);
                openPromptWorkbench(
                  '生成调整 Prompt',
                  '交由编码 Agent 同步规格与测试',
                  buildNegotiationPrompt(),
                );
              }}
              className="rounded border px-3 py-1.5 cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              生成调整 Prompt
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              className="rounded px-3 py-1.5 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              导出 proposal.md
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShareDeepLinkModal() {
  const {
    sharePopoverOpen,
    shareTarget,
    activeWorkspace,
    setSharePopoverOpen,
    getActiveMachineKey,
    showToast,
  } = useStudioStore();
  const [previewTab, setPreviewTab] = useState<'markdown' | 'json' | 'html'>('markdown');
  const [previewText, setPreviewText] = useState<string>('');

  const mk = getActiveMachineKey();
  const effectiveKind = shareTarget?.kind ?? (mk ? 'machine' : 'macro');
  const effectiveTarget = shareTarget?.targetId ?? mk ?? 'default';
  const base = activeWorkspace
    ? `${window.location.origin}/p/${encodeURIComponent(activeWorkspace.wsKey)}`
    : '';
  const url =
    effectiveKind === 'macro' && effectiveTarget === 'default'
      ? base
      : `${base}?kind=${encodeURIComponent(effectiveKind)}&target=${encodeURIComponent(effectiveTarget)}`;

  useEffect(() => {
    if (!sharePopoverOpen || !url) return;
    if (previewTab === 'html') {
      setPreviewText(
        `<!-- 浏览器打开该链接直接渲染交互画布，并内嵌：-->\n<script type="application/json" id="studio-focus-context">\n${JSON.stringify({ wsKey: activeWorkspace?.wsKey, targetKind: effectiveKind, targetId: effectiveTarget }, null, 2)}\n</script>`,
      );
      return;
    }
    const sep = url.includes('?') ? '&' : '?';
    const fetchUrl = `${url}${sep}format=${previewTab}`;
    let cancelled = false;
    void fetch(fetchUrl, {
      headers: { accept: previewTab === 'json' ? 'application/json' : '*/*' },
    })
      .then((r) => r.text())
      .then((txt) => {
        if (!cancelled) setPreviewText(txt.slice(0, 1800));
      })
      .catch(() => {
        if (!cancelled) setPreviewText('预览加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [sharePopoverOpen, previewTab, url, activeWorkspace?.wsKey, effectiveKind, effectiveTarget]);

  if (!sharePopoverOpen || !activeWorkspace) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/25 flex items-center justify-center p-6"
      onClick={() => setSharePopoverOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="studio-float w-[580px] max-w-[92vw] p-4 flex flex-col gap-3 text-xs"
      >
        <div className="flex items-center justify-between font-semibold text-sm">
          <span>分享状态链接 · {shareTarget?.title ?? '当前视图'}</span>
          <button
            type="button"
            onClick={() => setSharePopoverOpen(false)}
            className="p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <div
          className="rounded-lg border p-2.5 font-mono text-[11px] break-all flex items-center justify-between gap-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
        >
          <span>{url}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              showToast('已复制深链 URL');
            }}
            className="shrink-0 inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium cursor-pointer"
            style={{ background: 'var(--ink)', color: '#ffffff' }}
          >
            <Copy size={11} />
            <span>复制</span>
          </button>
        </div>

        {/* 3-Tab Transparent HTTP GET Content Negotiation Live Preview */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            {(
              [
                ['markdown', 'Markdown (GET 默认)'],
                ['json', 'JSON (?format=json)'],
                ['html', 'HTML (浏览器)'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPreviewTab(k)}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                style={{
                  background: previewTab === k ? 'var(--ink)' : 'var(--surface-subtle)',
                  color: previewTab === k ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <pre
            className="h-44 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
            style={{ borderColor: 'var(--paper-border)', background: 'var(--paper-warm)' }}
          >
            {previewText || '正在获取内容协商响应...'}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function RevisionDrawer() {
  const { revisionDrawerOpen, stateDoc, setRevisionDrawerOpen, decideRevision } = useStudioStore();
  if (!revisionDrawerOpen || !stateDoc) return null;

  const pending = stateDoc.revisions.filter((r) => r.status === 'pending');

  return (
    <aside
      aria-label="Agent 协商建议层"
      className="fixed right-3 top-[56px] bottom-3.5 w-[356px] z-40 studio-float flex flex-col overflow-hidden text-xs"
    >
      <div
        className="px-3.5 py-2.5 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          <GitPullRequest size={13} />
          <span>Agent 协商建议 ({pending.length})</span>
        </div>
        <button
          type="button"
          onClick={() => setRevisionDrawerOpen(false)}
          className="p-1 rounded hover:bg-black/5 cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {pending.length === 0 ? (
          <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
            当前暂无待审 Agent 建议。
          </div>
        ) : (
          pending.map((rev) => (
            <div
              key={rev.id}
              className="rounded-lg border p-3 flex flex-col gap-2"
              style={{ borderColor: 'var(--green-border)', background: 'var(--green-soft)' }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-[11px]">{rev.id}</span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {rev.ops.length} 项操作
                </span>
              </div>
              <div className="leading-relaxed">{rev.rationale}</div>
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => void decideRevision(rev.id, 'reject')}
                  className="rounded border px-2.5 py-1 cursor-pointer"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  忽略
                </button>
                <button
                  type="button"
                  onClick={() => void decideRevision(rev.id, 'accept')}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium cursor-pointer"
                  style={{ background: 'var(--green)', color: '#ffffff' }}
                >
                  <Check size={11} />
                  <span>采纳并入世界线</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export function SearchPaletteModal() {
  const {
    cmdkOpen,
    activeWorkspace,
    specs,
    stateDoc,
    setCmdkOpen,
    openSpecTab,
    openMachineTab,
    openSearchHit,
    setFocusStateUid,
    setDagPanelOpen,
    setWorldlineOpen,
    setSkin,
  } = useStudioStore();
  const [scope, setScope] = useState<'all' | 'specs' | 'commands'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deepHits, setDeepHits] = useState<StudioSearchHit[]>([]);
  const [recallProvider, setRecallProvider] = useState<'local-bm25' | 'rag-serve'>('local-bm25');

  useEffect(() => {
    if (!cmdkOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setDeepHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void studioApi
        .searchWorkspace(q, { wsKey: activeWorkspace?.wsKey, topK: 8 })
        .then((res) => {
          if (cancelled) return;
          setDeepHits(res.hits);
          setRecallProvider(res.provider);
        })
        .catch(() => {
          if (!cancelled) setDeepHits([]);
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cmdkOpen, searchQuery, activeWorkspace?.wsKey]);

  if (!cmdkOpen) return null;

  const machineEntries = Object.entries(stateDoc?.machines ?? {});

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-20 p-4"
      onClick={() => setCmdkOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="studio-float w-[580px] max-w-[94vw] overflow-hidden text-xs"
      >
        <Command label="全局搜索与命令">
          <Command.Input
            autoFocus
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="搜索规格、规则正文、守卫、评论或工作台命令..."
            className="w-full px-4 py-3 text-sm border-b outline-none"
            style={{ borderColor: 'var(--border)' }}
          />
          <div
            className="px-3 py-1.5 border-b flex items-center gap-1"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
          >
            {(
              [
                ['all', '全部'],
                ['specs', '规格与状态'],
                ['commands', '工作台命令'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setScope(k)}
                className="rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer"
                style={{
                  background: scope === k ? 'var(--ink)' : 'transparent',
                  color: scope === k ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center" style={{ color: 'var(--text-muted)' }}>
              未找到匹配项
            </Command.Empty>
            {scope !== 'commands' && (
              <>
                {deepHits.length > 0 && (
                  <Command.Group
                    heading={`工作区深度召回 · ${recallProvider === 'rag-serve' ? 'RAG 语义' : '本地全文'}`}
                  >
                    {deepHits.map((hit) => (
                      <Command.Item
                        key={hit.id}
                        value={`${searchQuery} ${hit.title} ${hit.snippet}`}
                        onSelect={() => {
                          setCmdkOpen(false);
                          openSearchHit(hit);
                        }}
                        className="flex flex-col gap-0.5 rounded-md px-3 py-1.5 cursor-pointer aria-selected:bg-black/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{hit.title}</span>
                          <span
                            className="font-mono text-[10px] shrink-0 rounded px-1.5 py-0.5"
                            style={{
                              background:
                                hit.source === 'rag-serve'
                                  ? 'var(--accent-soft)'
                                  : 'var(--surface-subtle)',
                              color:
                                hit.source === 'rag-serve' ? 'var(--accent)' : 'var(--text-muted)',
                            }}
                          >
                            {hit.source === 'rag-serve' ? 'RAG 语义' : '本地全文'}
                          </span>
                        </div>
                        {hit.snippet && (
                          <span
                            className="text-[11px] truncate"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {hit.snippet}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                <Command.Group heading="规格文档与决策表">
                  {specs.map((sp) => (
                    <Command.Item
                      key={sp.id}
                      value={`${sp.id} ${sp.summary}`}
                      onSelect={() => {
                        setCmdkOpen(false);
                        void openSpecTab(sp);
                      }}
                      className="flex items-center justify-between rounded-md px-3 py-2 cursor-pointer aria-selected:bg-black/5"
                    >
                      <span className="font-medium">{sp.title}</span>
                      <span
                        className="font-mono text-[10px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {sp.kind} · {sp.ruleCount}r
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="状态机与内部节点直跳">
                  {machineEntries.flatMap(([mk, draft]) =>
                    (draft.current?.states ?? []).map((st) => (
                      <Command.Item
                        key={`${mk}:${st.uid}`}
                        value={`${st.name} ${mk} ${draft.current?.capability ?? ''}`}
                        onSelect={() => {
                          setCmdkOpen(false);
                          openMachineTab(mk, draft.current?.capability ?? mk);
                          setFocusStateUid(st.uid);
                        }}
                        className="flex items-center justify-between rounded-md px-3 py-1.5 cursor-pointer aria-selected:bg-black/5"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Workflow size={11} style={{ color: 'var(--t-machine)' }} />
                          <span className="font-medium">{st.name}</span>
                        </span>
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {mk}
                        </span>
                      </Command.Item>
                    )),
                  )}
                </Command.Group>
              </>
            )}
            {scope !== 'specs' && (
              <Command.Group heading="工作台操作">
                <Command.Item
                  value="打开变更依赖图 graph dag"
                  onSelect={() => {
                    setCmdkOpen(false);
                    setDagPanelOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer aria-selected:bg-black/5"
                >
                  <Network size={13} />
                  <span>打开变更依赖视图</span>
                </Command.Item>
                <Command.Item
                  value="打开世界线对比 worldline"
                  onSelect={() => {
                    setCmdkOpen(false);
                    setWorldlineOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer aria-selected:bg-black/5"
                >
                  <GitBranch size={13} />
                  <span>打开世界线与分支对比</span>
                </Command.Item>
                <Command.Item
                  value="切换和纸暖墨皮肤 washi theme"
                  onSelect={() => {
                    setCmdkOpen(false);
                    setSkin('washi');
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer aria-selected:bg-black/5"
                >
                  <span>切换主题：和纸暖墨</span>
                </Command.Item>
                <Command.Item
                  value="切换 Linear 冷静灰皮肤 linear theme"
                  onSelect={() => {
                    setCmdkOpen(false);
                    setSkin('linear');
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer aria-selected:bg-black/5"
                >
                  <span>切换主题：Linear 冷静灰</span>
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
