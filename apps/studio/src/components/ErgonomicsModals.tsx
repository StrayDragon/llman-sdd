/**
 * On-demand Ergonomics Overlays (studio-web r157):
 * - ShortcutCheatSheetModal (`?` key): registry-driven, filtered by active view dialect
 * - GuidedTourOverlay (Canvas Settings → 交互式引导向导): 6-step replayable walkthrough
 */
import { ChevronLeft, ChevronRight, Compass, Keyboard, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { markTourCompleted, STUDIO_GUIDED_TOUR_STEPS } from '../ergonomics/guidedTour.ts';
import {
  filterShortcutsByView,
  scopeLabel,
  STUDIO_SHORTCUT_REGISTRY,
  type ViewDialectFilter,
} from '../ergonomics/shortcuts.ts';
import { useStudioStore } from '../store/studioStore.ts';

function deriveDefaultFilter(kind: string | undefined): ViewDialectFilter {
  if (kind === 'macro' || kind === 'forest') return 'macro';
  if (kind === 'machine') return 'machine';
  if (kind === 'doc') return 'doc';
  return 'all';
}

export function ShortcutCheatSheetModal() {
  const { shortcutsOpen, setShortcutsOpen, tabs, activeTabId } = useStudioStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [filter, setFilter] = useState<ViewDialectFilter>(() =>
    deriveDefaultFilter(activeTab?.kind),
  );

  useEffect(() => {
    if (shortcutsOpen) {
      setFilter(deriveDefaultFilter(activeTab?.kind));
    }
  }, [shortcutsOpen, activeTab?.kind]);

  if (!shortcutsOpen) return null;

  const items = filterShortcutsByView(filter, STUDIO_SHORTCUT_REGISTRY);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={() => setShortcutsOpen(false)}
    >
      <div
        role="dialog"
        aria-label="快捷键速查卡"
        onClick={(e) => e.stopPropagation()}
        className="studio-float w-[620px] max-w-[94vw] max-h-[82vh] flex flex-col overflow-hidden text-xs"
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
        >
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Keyboard size={14} />
            <span>快捷键速查卡</span>
          </div>
          <button
            type="button"
            aria-label="关闭快捷键速查卡"
            onClick={() => setShortcutsOpen(false)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <div
          className="px-4 py-2 border-b flex items-center gap-1"
          style={{ borderColor: 'var(--border)' }}
        >
          {(
            [
              ['all', '全部视图'],
              ['macro', '全景与组合'],
              ['machine', '状态机 / 流程图'],
              ['doc', '规则与决策表'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer"
              style={{
                background: filter === k ? 'var(--ink)' : 'transparent',
                color: filter === k ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border p-2.5 flex flex-col gap-1"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[12px]">{item.label}</span>
                <span className="inline-flex items-center gap-1 shrink-0">
                  {item.keys.map((k) => (
                    <kbd
                      key={`${item.id}-${k}`}
                      className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                      style={{
                        borderColor: 'var(--border-strong)',
                        background: 'var(--surface-subtle)',
                        color: 'var(--ink)',
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
              <div
                className="text-[11px] leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {item.detail}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {scopeLabel(item.scope)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GuidedTourOverlay() {
  const { tourStep, stepTour, closeTour } = useStudioStore();
  if (tourStep === null) return null;

  const step = STUDIO_GUIDED_TOUR_STEPS[tourStep];
  if (!step) return null;
  const isFirst = tourStep === 0;
  const isLast = tourStep === STUDIO_GUIDED_TOUR_STEPS.length - 1;

  const finish = (): void => {
    markTourCompleted();
    closeTour();
  };

  return (
    <div
      role="dialog"
      aria-label="交互式引导向导"
      className="fixed bottom-16 right-4 z-50 studio-float w-[368px] max-w-[92vw] p-4 flex flex-col gap-3 text-xs"
      style={{ borderColor: 'var(--accent-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 font-semibold text-[12.5px]">
          <Compass size={14} style={{ color: 'var(--accent)' }} />
          <span>{step.title}</span>
        </div>
        <button
          type="button"
          aria-label="跳过引导向导"
          onClick={finish}
          className="p-1 rounded hover:bg-black/5 cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>

      <p className="m-0 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {step.summary}
      </p>

      <div
        className="rounded-md px-2.5 py-1.5 text-[11px]"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        {step.actionHint}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          步骤 {tourStep + 1} / {STUDIO_GUIDED_TOUR_STEPS.length}
        </span>
        <div className="inline-flex items-center gap-1.5">
          {!isFirst && (
            <button
              type="button"
              onClick={() => stepTour(-1)}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 cursor-pointer hover:bg-black/5"
              style={{ borderColor: 'var(--border)' }}
            >
              <ChevronLeft size={12} />
              <span>上一步</span>
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-md px-3 py-1 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              完成引导
            </button>
          ) : (
            <button
              type="button"
              onClick={() => stepTour(1)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <span>下一步</span>
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
