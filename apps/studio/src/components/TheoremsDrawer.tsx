/**
 * Read-only Right-Anchored Human Theorems Preview Drawer (studio-web r162).
 * - Mutually exclusive with WorldlineDrawer (Axiom 1: opens right, shifts minimap left)
 * - Strictly read-only: displays lock status, filterable statements, rationale, executable gates,
 *   and copies the human CLI unlock command (`llman-sdd theorem unlock`).
 */
import { Copy, Lock, ShieldCheck, ShieldAlert, Terminal, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useStudioStore } from '../store/studioStore.ts';

export function TheoremsDrawer() {
  const { theoremsOpen, theorems, theoremLockStatus, setTheoremsOpen, showToast } =
    useStudioStore();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return theorems;
    return theorems.filter((th) =>
      `${th.id} ${th.title} ${th.statement} ${th.rationale ?? ''} ${th.gate ?? ''} ${th.tags.join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [theorems, query]);

  if (!theoremsOpen) return null;

  const lockBadge =
    theoremLockStatus === 'sealed'
      ? {
          label: '哈希已封签',
          bg: 'var(--green-soft)',
          color: 'var(--green)',
          border: 'var(--green-border)',
        }
      : theoremLockStatus === 'tampered'
        ? {
            label: '封签漂移警告',
            bg: 'var(--red-soft)',
            color: 'var(--red)',
            border: 'var(--red-border)',
          }
        : {
            label: '未封签',
            bg: 'var(--amber-soft)',
            color: 'var(--amber)',
            border: 'var(--amber-border)',
          };

  return (
    <aside
      aria-label="人类定理抽屉"
      className="fixed right-3 top-[56px] bottom-3.5 w-[360px] z-40 studio-float flex flex-col overflow-hidden text-xs"
    >
      <div
        className="px-3.5 py-2.5 border-b flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
      >
        <div className="flex items-center gap-1.5 font-semibold min-w-0">
          {theoremLockStatus === 'tampered' ? (
            <ShieldAlert size={14} style={{ color: 'var(--red)' }} />
          ) : (
            <ShieldCheck size={14} style={{ color: 'var(--green)' }} />
          )}
          <span className="truncate">人类定理（只读 · {theorems.length}）</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: lockBadge.bg,
              color: lockBadge.color,
              borderColor: lockBadge.border,
            }}
          >
            {lockBadge.label}
          </span>
          <button
            type="button"
            aria-label="关闭人类定理抽屉"
            onClick={() => setTheoremsOpen(false)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div
        className="px-3 py-2 border-b flex flex-col gap-1.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="检索定理 ID、约束正文或门禁命令..."
          className="w-full rounded-md border px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        />
        <div className="text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>
          人类定理为项目硬不变量，Agent 与 Studio
          仅只读遵循。需修订时请由人类在终端解锁编辑并重新封签。
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            {theorems.length === 0
              ? '当前工作区尚未声明 llmanspec/theorems/*.md 人类定理。'
              : '未找到匹配的人类定理条目。'}
          </div>
        ) : (
          filtered.map((th) => (
            <div
              key={th.id}
              className="rounded-lg border p-3 flex flex-col gap-1.5"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-mono font-semibold text-[11px]"
                  style={{ color: 'var(--accent)' }}
                >
                  theorem:{th.id}
                </span>
                {th.readOnly && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px]"
                    style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}
                  >
                    <Lock size={9} />
                    <span>OS 只读</span>
                  </span>
                )}
              </div>
              <div className="font-semibold text-[12px]">{th.title}</div>
              <div
                className="rounded-md p-2 text-[11.5px] leading-relaxed"
                style={{ background: 'var(--paper-warm)', color: 'var(--ink)' }}
              >
                {th.statement}
              </div>
              {th.rationale && (
                <div
                  className="text-[11px] leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  依据：{th.rationale}
                </div>
              )}
              {th.gate && (
                <div
                  className="inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10.5px]"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
                >
                  <Terminal size={10} style={{ color: 'var(--text-muted)' }} />
                  <span className="truncate">{th.gate}</span>
                </div>
              )}
              <div
                className="flex items-center justify-between pt-0.5 text-[10px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <span className="font-mono truncate">{th.file}</span>
                {th.scope && <span className="font-mono shrink-0">{th.scope}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <div
        className="px-3 py-2 border-t flex items-center justify-between gap-2 text-[11px]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
      >
        <span className="font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
          llman-sdd theorem unlock
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText('llman-sdd theorem unlock');
            showToast('已复制人类解锁命令：llman-sdd theorem unlock');
          }}
          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 cursor-pointer hover:bg-black/5 shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <Copy size={10} />
          <span>复制命令</span>
        </button>
      </div>
    </aside>
  );
}
