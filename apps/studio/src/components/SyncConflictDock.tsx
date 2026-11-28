/**
 * File-sync conflict dock: sits above the bottom operation bar and expands upward.
 * Two-column visual picks (canvas vs file) plus Lucide attention icon; no emoji.
 */
import type { SyncItem, SyncPick } from '@llman-sdd/core/studio';
import { AlertTriangle, Check, ChevronDown, ChevronUp, FileText, PenLine } from 'lucide-react';

import { useStudioStore } from '../store/studioStore.ts';
import { SYNC_COPY, syncSideCaption } from '../sync/copy.ts';
import { syncItemAllowsKeepBoth, syncItemIsExclusivePick } from '../sync/overlay.ts';

function sideTone(side: 'ours' | 'theirs'): { ink: string; soft: string; border: string } {
  return side === 'ours'
    ? { ink: 'var(--amber)', soft: 'var(--amber-soft)', border: 'var(--amber-border)' }
    : { ink: 'var(--green)', soft: 'var(--green-soft)', border: 'var(--green-border)' };
}

function SideWell({
  side,
  raw,
  present,
  selected,
  onPick,
}: {
  side: 'ours' | 'theirs';
  raw: string | null;
  present: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const tone = sideTone(side);
  const empty = !present;
  const Icon = side === 'ours' ? PenLine : FileText;
  return (
    <button
      type="button"
      disabled={empty}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      aria-label={`${side === 'ours' ? SYNC_COPY.yours : SYNC_COPY.incoming}：${empty ? SYNC_COPY.empty : syncSideCaption(raw)}`}
      aria-pressed={selected}
      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-left"
      style={{
        borderColor: selected ? tone.ink : empty ? 'var(--border)' : tone.border,
        background: selected ? tone.soft : empty ? 'var(--surface-subtle)' : 'var(--surface)',
        boxShadow: selected ? `0 0 0 2px ${tone.ink}` : undefined,
        color: empty ? 'var(--text-muted)' : 'var(--ink)',
        cursor: empty ? 'default' : 'pointer',
        opacity: empty ? 0.62 : 1,
      }}
    >
      <Icon
        size={14}
        strokeWidth={2.25}
        className="shrink-0"
        style={{ color: empty ? 'var(--text-muted)' : tone.ink }}
      />
      <span className="text-[13px] font-semibold leading-snug break-words">
        {empty ? SYNC_COPY.empty : syncSideCaption(raw)}
      </span>
    </button>
  );
}

function ItemCard({
  item,
  pick,
  focused,
  onFocus,
  onPick,
}: {
  item: SyncItem;
  pick: SyncPick | undefined;
  focused: boolean;
  onFocus: () => void;
  onPick: (next: SyncPick) => void;
}) {
  const exclusive = syncItemIsExclusivePick(item);
  return (
    <div
      role="listitem"
      onClick={onFocus}
      className="flex flex-col gap-1.5 rounded-xl border px-2 py-2 cursor-pointer"
      style={{
        borderColor: focused ? 'var(--ink)' : 'var(--border)',
        background: focused ? 'var(--surface-subtle)' : 'var(--surface)',
        boxShadow: focused ? '0 0 0 1px var(--ink)' : undefined,
      }}
    >
      {exclusive && (
        <div className="text-[10.5px] font-medium" style={{ color: 'var(--amber)' }}>
          {SYNC_COPY.sameThing}
        </div>
      )}
      <div
        className="flex items-stretch gap-1.5"
        role={exclusive ? 'radiogroup' : undefined}
        aria-label={exclusive ? SYNC_COPY.sameThing : undefined}
      >
        <SideWell
          side="ours"
          raw={item.labelOurs}
          present={item.oursPresent}
          selected={exclusive ? pick === 'ours' : pick === 'ours' || pick === 'both'}
          onPick={() => {
            onFocus();
            onPick('ours');
          }}
        />
        {exclusive ? (
          <span
            className="flex w-6 shrink-0 items-center justify-center text-[10px] font-bold"
            style={{ color: 'var(--amber)' }}
            aria-hidden
          >
            或
          </span>
        ) : null}
        <SideWell
          side="theirs"
          raw={item.labelTheirs}
          present={item.theirsPresent}
          selected={exclusive ? pick === 'theirs' : pick === 'theirs' || pick === 'both'}
          onPick={() => {
            onFocus();
            onPick('theirs');
          }}
        />
      </div>
      {syncItemAllowsKeepBoth(item) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
            onPick('both');
          }}
          className="self-center rounded-full px-2 py-0.5 text-[10.5px] cursor-pointer"
          style={{
            background: pick === 'both' ? 'var(--ink)' : 'transparent',
            color: pick === 'both' ? '#ffffff' : 'var(--text-muted)',
          }}
        >
          {SYNC_COPY.keepBoth}
        </button>
      )}
    </div>
  );
}

export function SyncConflictDock() {
  const {
    syncItems,
    syncPanelOpen,
    syncPicks,
    syncFocusItemId,
    staleFiles,
    worldlineOpen,
    bulkSyncPick,
    confirmSyncApply,
    setSyncPanelOpen,
    setSyncPick,
    setSyncFocusItemId,
  } = useStudioStore();

  const open = syncItems.length > 0 || staleFiles.length > 0;
  if (!open) return null;

  return (
    <div
      role="status"
      aria-label="规格同步提示"
      data-conflict-dock=""
      className="fixed z-40 flex w-[min(560px,calc(100vw-24px))] flex-col gap-1.5"
      style={{
        left: worldlineOpen ? 'calc((100vw - 356px) / 2)' : '50%',
        bottom: '4.5rem',
        transform: 'translateX(-50%)',
      }}
    >
      {syncPanelOpen && syncItems.length > 0 && (
        <div
          className="studio-island flex max-h-[min(46vh,380px)] flex-col gap-1.5 overflow-y-auto p-2"
          style={{
            borderColor: 'var(--amber-border)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <p className="px-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {SYNC_COPY.snapshotHint}
          </p>
          <div
            className="flex gap-1.5 px-1 text-[10.5px] font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="flex flex-1 items-center gap-1" style={{ color: 'var(--amber)' }}>
              <PenLine size={12} strokeWidth={2.25} />
              {SYNC_COPY.yours}
            </span>
            <span className="flex flex-1 items-center gap-1" style={{ color: 'var(--green)' }}>
              <FileText size={12} strokeWidth={2.25} />
              {SYNC_COPY.incoming}
            </span>
          </div>
          <div role="list" className="flex flex-col gap-1.5">
            {syncItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                pick={syncPicks[item.id]}
                focused={syncFocusItemId === item.id}
                onFocus={() => setSyncFocusItemId(item.id)}
                onPick={(next) => setSyncPick(item.id, next)}
              />
            ))}
          </div>
        </div>
      )}

      <div
        className="studio-island flex items-center gap-2 px-2.5 py-1.5 text-xs"
        style={{
          borderColor: 'var(--amber)',
          background: 'var(--amber-soft)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        <span
          className="studio-sync-attention-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--amber)', color: '#ffffff' }}
          title={SYNC_COPY.snapshotHint}
        >
          <AlertTriangle size={14} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1 leading-snug">
          <div className="font-semibold" style={{ color: 'var(--ink)' }}>
            {SYNC_COPY.attentionTitle}
            {syncItems.length > 0 ? ` · ${String(syncItems.length)}` : ''}
          </div>
          <div className="truncate" style={{ color: 'var(--text-secondary)' }}>
            {SYNC_COPY.banner}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => bulkSyncPick('ours')}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium cursor-pointer"
            style={{
              borderColor: 'var(--amber-border)',
              background: 'var(--surface)',
              color: 'var(--amber)',
            }}
            title={SYNC_COPY.keepMineAll}
            aria-label={SYNC_COPY.keepMineAll}
          >
            <PenLine size={12} />
            {SYNC_COPY.canvasShort}
          </button>
          <button
            type="button"
            onClick={() => bulkSyncPick('theirs')}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium cursor-pointer"
            style={{
              borderColor: 'var(--green-border)',
              background: 'var(--surface)',
              color: 'var(--green)',
            }}
            title={SYNC_COPY.takeTheirsAll}
            aria-label={SYNC_COPY.takeTheirsAll}
          >
            <FileText size={12} />
            {SYNC_COPY.fileShort}
          </button>
          <button
            type="button"
            onClick={() => void confirmSyncApply()}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold cursor-pointer"
            style={{ background: 'var(--green)', color: '#ffffff' }}
          >
            <Check size={12} strokeWidth={2.6} />
            {SYNC_COPY.done}
          </button>
          <button
            type="button"
            onClick={() => setSyncPanelOpen(!syncPanelOpen)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full cursor-pointer"
            style={{ background: 'var(--ink)', color: '#ffffff' }}
            title={SYNC_COPY.lookItemByItem}
            aria-label={SYNC_COPY.lookItemByItem}
            aria-expanded={syncPanelOpen}
          >
            {syncPanelOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
