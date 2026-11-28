/**
 * Workspace-Isolated Dynamic Start Guide Page (`+ 新标签页`, studio-web r154).
 * Matches studio-demo.html's clean, distraction-free Start Guide:
 * - Centered Hero + integrated search bar (live filter + ⌘K quick jump)
 * - Compact 2-column QUICK OPEN grid (Overview + top specs, expandable to full workspace list)
 * - Dynamic workspace `#tag (count)` chips + quick workspace actions (zero cross-repo leaks)
 * - Explicit 0-hit empty state recovery card instead of a blank screen
 */
import type { SpecIndexItem, StudioSearchHit } from '@llman-sdd/core/studio';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  GitMerge,
  Layers,
  Network,
  RotateCcw,
  Search,
  Share2,
  Table2,
  Workflow,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { studioApi } from '../api/client.ts';
import { useStudioStore } from '../store/studioStore.ts';

export interface WorkspaceTagCount {
  tag: string;
  count: number;
  capIds: string[];
}

export function aggregateWorkspaceTags(
  specs: readonly SpecIndexItem[],
  localTagsByCap: Readonly<Record<string, readonly string[]>> = {},
): WorkspaceTagCount[] {
  const byTag = new Map<string, Set<string>>();
  for (const sp of specs) {
    const merged = [...sp.tags, ...(localTagsByCap[sp.id] ?? [])];
    for (const raw of merged) {
      const tag = raw.startsWith('#') ? raw : `#${raw}`;
      const set = byTag.get(tag) ?? new Set<string>();
      set.add(sp.id);
      byTag.set(tag, set);
    }
  }
  return Array.from(byTag.entries())
    .map(([tag, set]) => ({ tag, count: set.size, capIds: Array.from(set) }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function filterWorkspaceSpecs(
  specs: readonly SpecIndexItem[],
  query: string,
  selectedTag: string | null,
  localTagsByCap: Readonly<Record<string, readonly string[]>> = {},
): SpecIndexItem[] {
  const q = query.trim().toLowerCase();
  return specs.filter((sp) => {
    if (selectedTag) {
      const tags = [...sp.tags, ...(localTagsByCap[sp.id] ?? [])];
      if (!tags.includes(selectedTag)) return false;
    }
    if (!q) return true;
    return (
      sp.id.toLowerCase().includes(q) ||
      sp.title.toLowerCase().includes(q) ||
      sp.summary.toLowerCase().includes(q) ||
      sp.reqPreview.some((r) => r.toLowerCase().includes(q))
    );
  });
}

const KIND_PRIORITY: Record<SpecIndexItem['kind'], number> = {
  machine: 0,
  flow: 1,
  decision: 2,
  doc: 3,
};

const KIND_LABEL: Record<SpecIndexItem['kind'], string> = {
  machine: '状态机',
  flow: '流程图',
  decision: '决策表',
  doc: '规则',
};

export function NewTabQuickPage() {
  const {
    activeWorkspace,
    tabs,
    specs,
    localTagsByCap,
    openSpecTab,
    openSearchHit,
    createForestTab,
    activateTab,
    restoreDefaultTabs,
    setDagPanelOpen,
    setCmdkOpen,
  } = useStudioStore();
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showAllSpecs, setShowAllSpecs] = useState(false);
  const [deepHits, setDeepHits] = useState<StudioSearchHit[]>([]);
  const [recallProvider, setRecallProvider] = useState<'local-bm25' | 'rag-serve'>('local-bm25');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setDeepHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void studioApi
        .searchWorkspace(q, { wsKey: activeWorkspace?.wsKey, topK: 6 })
        .then((res) => {
          if (cancelled) return;
          setDeepHits(res.hits);
          setRecallProvider(res.provider);
        })
        .catch(() => {
          if (!cancelled) setDeepHits([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, activeWorkspace?.wsKey]);

  const tagCounts = useMemo(
    () => aggregateWorkspaceTags(specs, localTagsByCap),
    [specs, localTagsByCap],
  );

  const sortedSpecs = useMemo(
    () =>
      [...specs].sort(
        (a, b) =>
          KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] ||
          b.ruleCount - a.ruleCount ||
          a.id.localeCompare(b.id),
      ),
    [specs],
  );

  const matched = useMemo(
    () => filterWorkspaceSpecs(sortedSpecs, query, selectedTag, localTagsByCap),
    [sortedSpecs, query, selectedTag, localTagsByCap],
  );

  const isFiltering = query.trim() !== '' || selectedTag !== null;
  const visibleQuickSpecs = isFiltering || showAllSpecs ? matched : matched.slice(0, 3);
  const hiddenCount = Math.max(0, matched.length - visibleQuickSpecs.length);

  return (
    <div className="w-full h-full overflow-y-auto px-6 pt-24 pb-16 flex justify-center">
      <div className="w-full max-w-[740px] flex flex-col gap-6">
        {/* Clean Demo-Aligned Hero */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <Share2 size={13} />
            </span>
            <h1 className="text-lg font-bold tracking-tight">llman-sdd studio</h1>
            {activeWorkspace && (
              <span
                className="font-mono text-[11px] rounded-full border px-2.5 py-0.5"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-secondary)',
                }}
              >
                {activeWorkspace.repo} · {activeWorkspace.branch}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            按当前工作区动态呈现可打开的规格与标签视角。右键任意标签页可置顶记忆或关闭。
          </p>
        </div>

        {/* Integrated Search Input (Live Filter + ⌘K Shortcut) */}
        <div
          className="studio-island flex items-center gap-2.5 px-3.5 py-2.5 text-xs transition-colors focus-within:border-[var(--ink)]"
          style={{ background: 'var(--surface)' }}
        >
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索当前工作区规格、摘要、@req 编号..."
            className="flex-1 bg-transparent outline-none text-[13px]"
          />
          {isFiltering ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedTag(null);
              }}
              className="rounded px-2 py-0.5 text-[11px] cursor-pointer hover:bg-black/5"
              style={{ color: 'var(--text-secondary)' }}
            >
              清除过滤
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCmdkOpen(true)}
              className="font-mono text-[10.5px] rounded border px-1.5 py-0.5 cursor-pointer hover:bg-black/5"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text-muted)',
                background: 'var(--surface-subtle)',
              }}
              title="打开全局命令面板"
            >
              ⌘K
            </button>
          )}
        </div>

        {/* Deep Full-Text / RAG Recall Hits */}
        {deepHits.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-mono text-[10.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                工作区深度召回（{deepHits.length}）
              </span>
              <span
                className="font-mono text-[10px] rounded-full border px-2 py-0.5"
                style={{
                  borderColor:
                    recallProvider === 'rag-serve' ? 'var(--accent-border)' : 'var(--border)',
                  background:
                    recallProvider === 'rag-serve' ? 'var(--accent-soft)' : 'var(--surface-subtle)',
                  color: recallProvider === 'rag-serve' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {recallProvider === 'rag-serve' ? 'RAG 语义' : '本地全文'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {deepHits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => openSearchHit(hit)}
                  className="studio-card p-2.5 text-left flex flex-col gap-1 cursor-pointer hover:border-[var(--ink)]"
                >
                  <div className="font-semibold text-xs truncate">{hit.title}</div>
                  {hit.snippet && (
                    <div
                      className="text-[11px] leading-relaxed studio-clamp-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {hit.snippet}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section 1: QUICK OPEN (Compact 2-Column Grid matching studio-demo.html) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span
              className="font-mono text-[10.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              {isFiltering
                ? `筛选结果（${String(matched.length)} 项）`
                : '快速打开（当前工作区） · QUICK OPEN'}
            </span>
            {isFiltering && matched.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  createForestTab(
                    selectedTag ?? `筛选: ${query.trim()}`,
                    matched.map((s) => s.id),
                    selectedTag,
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium cursor-pointer hover:bg-black/5"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <Layers size={11} />
                <span>建为新 Tab 视图 ({matched.length})</span>
              </button>
            )}
          </div>

          {matched.length === 0 ? (
            <div
              role="status"
              className="studio-island p-7 flex flex-col items-center justify-center text-center gap-2.5"
            >
              <div className="text-sm font-semibold">未找到匹配的规格</div>
              <div className="text-xs max-w-md" style={{ color: 'var(--text-muted)' }}>
                当前过滤条件（{selectedTag ? `标签 ${selectedTag}` : ''}
                {selectedTag && query.trim() ? ' + ' : ''}
                {query.trim() ? `关键词「${query.trim()}」` : ''}）在当前工作区命中 0 项。
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSelectedTag(null);
                  }}
                  className="rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer"
                  style={{ background: 'var(--ink)', color: '#ffffff' }}
                >
                  清除过滤条件
                </button>
                <button
                  type="button"
                  onClick={restoreDefaultTabs}
                  className="rounded-md border px-3 py-1.5 text-xs cursor-pointer hover:bg-black/5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  回到主视图
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Overview Card (shown in default non-filtered Start view) */}
                {!isFiltering && (
                  <button
                    type="button"
                    onClick={() =>
                      tabs.some((t) => t.id === 'main') ? activateTab('main') : restoreDefaultTabs()
                    }
                    className="studio-island p-3.5 text-left flex items-start gap-3 cursor-pointer hover:border-[var(--ink)] transition-colors"
                  >
                    <span className="type-icon-box machine w-8 h-8 shrink-0">
                      <Share2 size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[12.5px] truncate">
                        全景规格图 · {activeWorkspace?.repo ?? '主视图'}
                      </div>
                      <div
                        className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        当前工作区共 {specs.length} 份规格 · 领域分组与跨能力契约视角
                      </div>
                    </div>
                  </button>
                )}

                {visibleQuickSpecs.map((sp) => {
                  const Icon =
                    sp.kind === 'machine'
                      ? Workflow
                      : sp.kind === 'flow'
                        ? GitMerge
                        : sp.kind === 'decision'
                          ? Table2
                          : FileText;
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => void openSpecTab(sp)}
                      className="studio-island p-3.5 text-left flex items-start gap-3 cursor-pointer hover:border-[var(--ink)] transition-colors"
                    >
                      <span className={`type-icon-box ${sp.kind} w-8 h-8 shrink-0`}>
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[12.5px] truncate">
                            {sp.title}（{KIND_LABEL[sp.kind]}）
                          </span>
                          <span
                            className="font-mono text-[10px] shrink-0"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {sp.ruleCount}r
                          </span>
                        </div>
                        <div
                          className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {sp.summary}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {!isFiltering && (hiddenCount > 0 || showAllSpecs) && (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setShowAllSpecs(!showAllSpecs)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] cursor-pointer hover:bg-black/5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {showAllSpecs ? (
                      <>
                        <ChevronUp size={12} />
                        <span>收起其余规格</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown size={12} />
                        <span>
                          展开全部 {specs.length} 份规格（还有 {hiddenCount} 份）
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Section 2: TAGS & WORKSPACE (Clean Action Chips matching studio-demo.html) */}
        <div className="flex flex-col gap-2.5">
          <div
            className="font-mono text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            按当前工作区 TAG 筛选视角 · TAGS &amp; WORKSPACE
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {tagCounts.map((item) => {
              const active = selectedTag === item.tag;
              return (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => createForestTab(`${item.tag} 视角`, item.capIds, item.tag)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedTag(active ? null : item.tag);
                  }}
                  title="点击以该标签新建森林 Tab（右键原地筛选）"
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer hover:border-[var(--ink)] transition-colors"
                  style={{
                    borderColor: active ? 'var(--ink)' : 'var(--border)',
                    background: active ? 'var(--ink)' : 'var(--surface)',
                    color: active ? '#ffffff' : 'var(--text-secondary)',
                  }}
                >
                  <span>{item.tag}</span>
                  <span
                    className="font-mono text-[10.5px]"
                    style={{ color: active ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}
                  >
                    ({item.count})
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setDagPanelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer hover:border-[var(--ink)] transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
              }}
            >
              <Network size={11} />
              <span>打开变更依赖侧栏</span>
            </button>
            <button
              type="button"
              onClick={restoreDefaultTabs}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer hover:border-[var(--ink)] transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
              }}
            >
              <RotateCcw size={11} />
              <span>恢复默认工作区 Tab</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
