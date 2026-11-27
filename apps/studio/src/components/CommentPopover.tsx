/**
 * Unified Draggable Near-Cursor Comment Popover across all 6 Anchor Kinds
 * (forest, macro-edge, machine, state, edge, doc).
 * Warm archival paper tint for human comments, soft green tint for Agent replies.
 */
import type { SemanticAnchor } from '@llman-sdd/core/studio';
import { Check, GripHorizontal, MessageSquare, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';

import { useStudioStore } from '../store/studioStore.ts';

function anchorsEqual(a: SemanticAnchor, b: SemanticAnchor): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'machine':
      return b.kind === 'machine' && a.machineKey === b.machineKey;
    case 'state':
      return b.kind === 'state' && a.machineKey === b.machineKey && a.stateUid === b.stateUid;
    case 'edge':
      return b.kind === 'edge' && a.machineKey === b.machineKey && a.edgeUid === b.edgeUid;
    case 'forest':
      return b.kind === 'forest' && a.capability === b.capability;
    case 'macro-edge':
      return b.kind === 'macro-edge' && a.edgeId === b.edgeId;
    case 'doc':
      return (
        b.kind === 'doc' && a.capability === b.capability && (a.reqId ?? '') === (b.reqId ?? '')
      );
  }
}

function anchorEyebrow(a: SemanticAnchor): string {
  switch (a.kind) {
    case 'machine':
      return `状态机 · ${a.machineKey}`;
    case 'state':
      return `节点 · ${a.stateUid}`;
    case 'edge':
      return `转移边 · ${a.edgeUid}`;
    case 'forest':
      return `规格卡 · ${a.capability}`;
    case 'macro-edge':
      return `规格连线 · ${a.edgeId}`;
    case 'doc':
      return `文档规则 · ${a.capability}${a.reqId ? ` (@req:${a.reqId})` : ''}`;
  }
}

export function CommentPopover() {
  const {
    commentPopover,
    stateDoc,
    closeCommentPopover,
    addComment,
    editComment,
    resolveComment,
    reopenComment,
    deleteComment,
  } = useStudioStore();

  const [draftBody, setDraftBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!commentPopover) {
      setPos(null);
      return;
    }
    const width = 344;
    const preferRight = commentPopover.x + 14 + width < window.innerWidth - 12;
    const left = preferRight ? commentPopover.x + 14 : Math.max(12, commentPopover.x - width - 14);
    const top = Math.min(window.innerHeight - 360, Math.max(60, commentPopover.y - 16));
    setPos({ left, top });
  }, [commentPopover]);

  if (!commentPopover || !stateDoc || !pos) return null;

  const matched = stateDoc.comments.filter((c) => anchorsEqual(c.anchor, commentPopover.anchor));
  const openCount = matched.filter((c) => c.status === 'open').length;

  const startDrag = (e: MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const init = { ...pos };
    const onMove = (mv: globalThis.MouseEvent): void => {
      setPos({
        left: Math.max(12, Math.min(window.innerWidth - 356, init.left + mv.clientX - startX)),
        top: Math.max(54, Math.min(window.innerHeight - 160, init.top + mv.clientY - startY)),
      });
    };
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const submitNew = (): void => {
    if (draftBody.trim() === '') return;
    addComment(commentPopover.anchor, draftBody);
    setDraftBody('');
  };

  return (
    <div
      className="fixed z-50 w-[344px] studio-float flex flex-col overflow-hidden text-xs"
      style={{ left: pos.left, top: pos.top }}
    >
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between gap-2 px-3 py-2 border-b cursor-grab active:cursor-grabbing select-none"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
      >
        <div className="min-w-0">
          <div
            className="font-mono text-[9.5px] uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {anchorEyebrow(commentPopover.anchor)}
          </div>
          <div className="flex items-center gap-1.5 font-semibold mt-0.5">
            <GripHorizontal size={11} style={{ color: 'var(--text-muted)' }} />
            <MessageSquare size={12} />
            <span className="truncate">{commentPopover.title}</span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              ({openCount})
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭评论浮窗"
          onClick={closeCommentPopover}
          className="p-1 rounded hover:bg-black/5 cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto p-2.5 flex flex-col gap-2">
        {matched.length === 0 ? (
          <div className="text-center py-3" style={{ color: 'var(--text-muted)' }}>
            暂无评论，在下方输入后会精确锚定到此对象。
          </div>
        ) : (
          matched.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border p-2.5"
              style={{
                borderColor:
                  c.status === 'resolved'
                    ? 'var(--border)'
                    : c.author === 'agent'
                      ? 'var(--green-border)'
                      : 'var(--paper-border)',
                opacity: c.status === 'resolved' ? 0.62 : 1,
                background:
                  c.status === 'resolved'
                    ? 'var(--surface-subtle)'
                    : c.author === 'agent'
                      ? 'var(--green-soft)'
                      : 'var(--paper-warm)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className="font-mono text-[10px] font-semibold"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {c.author === 'agent' ? 'Agent' : '你'} ·{' '}
                  {c.status === 'resolved' ? '已解决' : '未解决'}
                </span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    title="编辑"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditText(c.body);
                    }}
                    className="p-0.5 hover:text-blue-600 cursor-pointer"
                  >
                    <Pencil size={11} />
                  </button>
                  {c.status === 'open' ? (
                    <button
                      type="button"
                      title="标记已解决"
                      onClick={() => resolveComment(c.id)}
                      className="p-0.5 hover:text-green-700 cursor-pointer"
                    >
                      <Check size={11} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      title="重新打开"
                      onClick={() => reopenComment(c.id)}
                      className="p-0.5 hover:text-amber-700 cursor-pointer"
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                  <button
                    type="button"
                    title="删除"
                    onClick={() => deleteComment(c.id)}
                    className="p-0.5 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {editingId === c.id ? (
                <div className="flex flex-col gap-1">
                  <textarea
                    rows={2}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        editComment(c.id, editText);
                        setEditingId(null);
                      } else if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    className="w-full rounded border p-1.5 text-xs outline-none"
                    style={{ borderColor: 'var(--accent)', background: 'var(--surface)' }}
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-2 py-0.5 rounded border text-[11px] cursor-pointer"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        editComment(c.id, editText);
                        setEditingId(null);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] cursor-pointer"
                      style={{ background: 'var(--ink)', color: '#ffffff' }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="leading-relaxed whitespace-pre-wrap">{c.body}</div>
              )}
            </div>
          ))
        )}
      </div>

      <div
        className="p-2.5 border-t flex flex-col gap-1.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <textarea
          rows={2}
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitNew();
          }}
          placeholder="输入评论内容（⌘+Enter 提交）..."
          className="w-full rounded-md border p-2 text-xs outline-none resize-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submitNew}
            className="rounded-md px-3 py-1 text-xs font-medium cursor-pointer"
            style={{ background: 'var(--ink)', color: '#ffffff' }}
          >
            提交评论
          </button>
        </div>
      </div>
    </div>
  );
}
