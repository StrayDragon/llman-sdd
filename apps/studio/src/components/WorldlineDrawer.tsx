/**
 * Right-Anchored Multi-Branch Worldline Drawer (Axiom 1: Proximity Anchor to Top-Right Trigger).
 * Supports non-destructive parentId/actor branch tree, Git Worktree peer switching,
 * and 1:1 live interactive canvas overlay diff. Production-pure monochrome SVG UI.
 */
import { Clock, GitBranch, Sparkles, X } from 'lucide-react';

import { useStudioStore } from '../store/studioStore.ts';

export function WorldlineDrawer() {
  const {
    worldlineOpen,
    worldlineComparing,
    worldlineCompareAId,
    activeWorkspace,
    peerWorktrees,
    stateDoc,
    setWorldlineOpen,
    switchWorldlineTo,
    toggleWorldlineCompare,
    switchWorkspace,
    openPromptWorkbench,
    buildNegotiationPrompt,
    getActiveMachineKey,
  } = useStudioStore();

  if (!worldlineOpen || !stateDoc || !activeWorkspace) return null;

  const machineKey = getActiveMachineKey() ?? Object.keys(stateDoc.machines)[0] ?? null;
  const timeline = machineKey ? stateDoc.timelines[machineKey] : undefined;
  const entries = timeline?.entries ?? [];
  const headIdx = timeline?.headIdx ?? 0;

  // Compute branch lane indentation cleanly from parentId
  const laneOf = new Map<string, number>([['BASE', 0]]);
  const firstChildUsed = new Set<string>();
  entries.forEach((e, idx) => {
    if (idx === 0) return;
    const pId = e.parentId && laneOf.has(e.parentId) ? e.parentId : 'BASE';
    const pLane = laneOf.get(pId) ?? 0;
    if (!firstChildUsed.has(pId)) {
      firstChildUsed.add(pId);
      laneOf.set(e.id, pLane);
    } else {
      laneOf.set(e.id, Math.min(2, pLane + 1));
    }
  });

  return (
    <aside
      aria-label="世界线抽屉"
      className="fixed right-3 top-[56px] bottom-3.5 w-[344px] z-40 studio-float flex flex-col overflow-hidden"
    >
      <div
        className="flex items-start justify-between gap-2 px-3 py-2.5 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Clock size={13} />
            <span className="truncate">世界线 · {machineKey ?? activeWorkspace.repo}</span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            点节点切左侧 1:1 真实画布；点「与当前对比」直接在画布上红绿高亮
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭世界线"
          onClick={() => setWorldlineOpen(false)}
          className="p-1 rounded hover:bg-black/5 cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>

      {/* Git Worktree Strip (Monochrome GitBranch SVG, zero emojis) */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] border-b"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        <span
          className="inline-flex items-center gap-1.5 font-mono font-semibold"
          style={{ color: 'var(--ink)' }}
        >
          <GitBranch size={12} />
          <span>{activeWorkspace.branch}</span>
        </span>
        {peerWorktrees.length > 0 ? (
          <div className="inline-flex items-center gap-1">
            {peerWorktrees.map((pw) => (
              <button
                key={pw.wsKey}
                type="button"
                onClick={() => void switchWorkspace(pw.wsKey)}
                className="rounded border px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-black/5"
                style={{ borderColor: 'var(--border)' }}
              >
                切 {pw.branch}
              </button>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>单工作树</span>
        )}
      </div>

      {/* Branching Snapshot Tree */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-1.5">
        {entries.length === 0 ? (
          <div className="text-xs p-3 text-center" style={{ color: 'var(--text-muted)' }}>
            打开任意状态机后即可查看和对比分支历史。
          </div>
        ) : (
          entries
            .slice()
            .reverse()
            .map((entry) => {
              const idx = entries.indexOf(entry);
              const isHead = idx === headIdx;
              const isCmpA = worldlineComparing && worldlineCompareAId === entry.id;
              const lane = laneOf.get(entry.id) ?? 0;
              const actorLabel = entry.isBase ? '原规格' : entry.actor === 'agent' ? 'Agent' : '你';
              return (
                <div
                  key={`${entry.id}-${String(entry.seq)}`}
                  onClick={() => {
                    if (!isHead && machineKey) switchWorldlineTo(machineKey, idx);
                  }}
                  className="rounded-lg border p-2.5 text-xs cursor-pointer transition-colors"
                  style={{
                    marginLeft: lane * 14,
                    borderColor: isHead
                      ? 'var(--green)'
                      : isCmpA
                        ? 'var(--accent)'
                        : 'var(--border)',
                    background: isHead ? 'var(--green-soft)' : 'var(--surface)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className="font-mono text-[10px] font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {entry.id}
                      {entry.parentId ? ` <- ${entry.parentId}` : ''} · {actorLabel}
                    </span>
                    <div className="inline-flex items-center gap-1">
                      {isHead && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{ background: 'var(--green)', color: '#fff' }}
                        >
                          画布当前
                        </span>
                      )}
                      {isCmpA && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                          对比基准
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-medium text-[12px]">{entry.label}</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {entry.createdAt.slice(11, 19)}
                    </span>
                    {!isHead && machineKey && (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWorldlineCompare(entry.id);
                          }}
                          className="rounded border px-1.5 py-0.5 text-[10px] cursor-pointer"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          {isCmpA ? '取消对比' : '与当前对比'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            switchWorldlineTo(machineKey, idx);
                          }}
                          className="rounded border px-1.5 py-0.5 text-[10px] cursor-pointer"
                          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                        >
                          切到此节点
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
        )}
      </div>

      <div
        className="p-2.5 border-t flex flex-col gap-1.5"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
      >
        <button
          type="button"
          onClick={() =>
            openPromptWorkbench(
              '生成调整 Prompt',
              '汇总当前语义差异与未解决评论，确认后复制给编码 Agent',
              buildNegotiationPrompt(machineKey ?? undefined),
            )
          }
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium cursor-pointer"
          style={{ background: 'var(--ink)', color: 'var(--surface)' }}
        >
          <Sparkles size={13} />
          <span>生成调整 Prompt</span>
        </button>
      </div>
    </aside>
  );
}
