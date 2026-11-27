/**
 * Workspace-Isolated Dynamic Quick-Launch Page (`+ 新标签页`, studio-web r154).
 * Aggregates real specs and `#tag (count)` strictly from the active workspace (zero cross-repo leaks)
 * and renders an explicit 0-hit empty state recovery card instead of a blank canvas.
 */
import type { SpecIndexItem } from '@llman-sdd/core/studio';
import { FileText, GitMerge, Layers, RotateCcw, Search, Table2, Tag, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';

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

export function NewTabQuickPage() {
  const {
    activeWorkspace,
    specs,
    localTagsByCap,
    openSpecTab,
    createForestTab,
    restoreDefaultTabs,
  } = useStudioStore();
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const tagCounts = useMemo(
    () => aggregateWorkspaceTags(specs, localTagsByCap),
    [specs, localTagsByCap],
  );

  const matched = useMemo(
    () => filterWorkspaceSpecs(specs, query, selectedTag, localTagsByCap),
    [specs, query, selectedTag, localTagsByCap],
  );

  return (
    <div className="w-full h-full overflow-y-auto pt-20 pb-24 px-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-base font-semibold">
              快速引导页 ·{' '}
              {activeWorkspace
                ? `${activeWorkspace.repo} (${activeWorkspace.branch})`
                : '当前工作区'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              按当前工作区动态聚合 {specs.length} 份真实规格与标签，零跨仓串味；点击规格进入独立编辑
              Tab 或按标签新建切片视图。
            </div>
          </div>
          <button
            type="button"
            onClick={restoreDefaultTabs}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-black/5"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <RotateCcw size={12} />
            <span>回到主视图</span>
          </button>
        </div>

        {/* Search Input */}
        <div
          className="studio-island flex items-center gap-2 px-3 py-2 text-xs"
          style={{ background: 'var(--surface)' }}
        >
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索当前工作区规格、摘要或 @req 编号..."
            className="flex-1 bg-transparent outline-none text-xs"
          />
          {(query || selectedTag) && (
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
          )}
        </div>

        {/* Dynamic Workspace #tag Aggregation */}
        {tagCounts.length > 0 && (
          <div className="flex flex-col gap-2">
            <div
              className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <Tag size={11} />
              <span>当前工作区标签聚合</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {tagCounts.map((item) => {
                const active = selectedTag === item.tag;
                return (
                  <div key={item.tag} className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedTag(active ? null : item.tag)}
                      className="rounded-l-full border px-2.5 py-1 text-[11px] font-mono cursor-pointer transition-colors"
                      style={{
                        borderColor: active ? 'var(--ink)' : 'var(--border)',
                        background: active ? 'var(--ink)' : 'var(--surface)',
                        color: active ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      {item.tag} ({item.count})
                    </button>
                    <button
                      type="button"
                      title={`按 ${item.tag} 新建森林 Tab`}
                      onClick={() => createForestTab(item.tag, item.capIds, item.tag)}
                      className="rounded-r-full border border-l-0 px-2 py-1 text-[10px] cursor-pointer hover:bg-black/5"
                      style={{
                        borderColor: active ? 'var(--ink)' : 'var(--border)',
                        background: 'var(--surface-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      + Tab
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Spec Cards Grid or Explicit 0-Hit Empty State Recovery Card */}
        {matched.length === 0 ? (
          <div
            role="status"
            className="studio-island p-8 flex flex-col items-center justify-center text-center gap-3"
          >
            <div className="text-sm font-semibold">未找到匹配的规格</div>
            <div className="text-xs max-w-md" style={{ color: 'var(--text-muted)' }}>
              当前过滤条件（{selectedTag ? `标签 ${selectedTag}` : ''}
              {selectedTag && query ? ' + ' : ''}
              {query ? `关键词「${query}」` : ''}）在当前工作区命中 0 项。
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
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>匹配 {matched.length} 份规格</span>
              {(query || selectedTag) && matched.length >= 1 && (
                <button
                  type="button"
                  onClick={() =>
                    createForestTab(
                      selectedTag ?? `筛选: ${query}`,
                      matched.map((s) => s.id),
                      selectedTag,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium cursor-pointer hover:bg-black/5"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  <Layers size={11} />
                  <span>将当前 {matched.length} 项建为新 Tab 视图</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matched.map((sp) => {
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
                    className="studio-island p-3.5 text-left flex flex-col gap-2 cursor-pointer hover:border-[var(--ink)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span className={`type-icon-box ${sp.kind} w-6 h-6 shrink-0`}>
                          <Icon size={12} />
                        </span>
                        <span className="font-semibold text-xs truncate">{sp.title}</span>
                      </span>
                      <span
                        className="font-mono text-[10px] shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {sp.ruleCount}r · {sp.scenarioCount}s
                      </span>
                    </div>
                    <div
                      className="text-[11px] leading-relaxed line-clamp-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {sp.summary}
                    </div>
                    {sp.reqPreview.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {sp.reqPreview.slice(0, 3).map((r) => (
                          <span
                            key={r}
                            className="font-mono text-[10px] rounded px-1.5 py-0.5"
                            style={{
                              background: 'var(--surface-subtle)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
