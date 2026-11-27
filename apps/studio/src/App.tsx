/**
 * Root Studio Web Workbench Application.
 * Coordinates initial bootstrap, Deep-Link focus restore, SSE live refresh (self-echo filtered),
 * pagehide keepalive flush, and global keyboard shortcuts (⌘K, ⌘Z/⌘⇧Z, Alt+←/→/↑, Esc).
 */
import { useEffect } from 'react';

import { studioApi } from './api/client.ts';
import { BottomChrome } from './components/BottomChrome.tsx';
import { ChangeDagPanel } from './components/ChangeDagPanel.tsx';
import { CommentPopover } from './components/CommentPopover.tsx';
import {
  PromptWorkbenchModal,
  RevisionDrawer,
  SaveGuardModal,
  SearchPaletteModal,
  ShareDeepLinkModal,
} from './components/Modals.tsx';
import { SpecDocCanvas } from './components/SpecDocCanvas.tsx';
import { StateMachineCanvas } from './components/StateMachineCanvas.tsx';
import { TopChrome } from './components/TopChrome.tsx';
import { WorldlineDrawer } from './components/WorldlineDrawer.tsx';
import { useStudioStore } from './store/studioStore.ts';

function readInitialWsKeyFromLocation(): string | undefined {
  const m = /^\/p\/([^/]+)/u.exec(window.location.pathname);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readInitialFocusContext(): {
  wsKey?: string;
  targetKind?: string;
  targetId?: string;
} {
  try {
    const el = document.getElementById('studio-focus-context');
    if (el?.textContent) {
      const parsed = JSON.parse(el.textContent) as {
        wsKey?: string;
        targetKind?: string;
        targetId?: string;
      };
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // Ignore malformed inline focus context
  }
  const params = new URLSearchParams(window.location.search);
  return {
    targetKind: params.get('kind') ?? undefined,
    targetId: params.get('target') ?? undefined,
  };
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function App() {
  const {
    loading,
    error,
    tabs,
    activeTabId,
    toastMsg,
    init,
    refreshInPlace,
    flushPendingSaves,
    setCmdkOpen,
    navBack,
    navForward,
    jumpNestLevel,
    closeCommentPopover,
    setSettingsOpen,
    setLinterOpen,
    undoActiveMachine,
    redoActiveMachine,
    showToast,
  } = useStudioStore();

  // 1. Bootstrap + Deep-Link Focus Restore + SSE live refresh (NEVER re-runs on nestStack changes)
  useEffect(() => {
    const focusCtx = readInitialFocusContext();
    const initialWs = readInitialWsKeyFromLocation() ?? focusCtx.wsKey;
    void init(initialWs).then(() => {
      const st = useStudioStore.getState();
      const targetId = focusCtx.targetId;
      if (!targetId || targetId === 'default') return;
      if (focusCtx.targetKind === 'machine' && st.stateDoc?.machines[targetId]) {
        st.openMachineTab(targetId);
      } else if (focusCtx.targetKind === 'doc') {
        const spec = st.specs.find((s) => s.id === targetId);
        if (spec) void st.openSpecTab(spec);
      }
    });

    const unsubscribe = studioApi.subscribeEvents((ev) => {
      if (ev.type === 'ping') return;
      const activeWs = useStudioStore.getState().activeWorkspace;
      if (!activeWs || ev.wsKey !== activeWs.wsKey) return;
      if (ev.type === 'git-head-changed') {
        showToast(`检测到分支切换至 ${ev.branch}，正在刷新工作区状态`);
        void init(activeWs.wsKey);
      } else if (ev.type === 'specs-changed' || ev.type === 'state-updated') {
        void refreshInPlace(activeWs.wsKey);
      }
    });

    const onPageHide = (): void => {
      void flushPendingSaves({ keepalive: true });
    };
    // Global Native ContextMenu Takeover (matching studio-demo.html:9629 — zero browser menu leak!)
    const onGlobalContextMenu = (ev: MouseEvent): void => {
      const target = ev.target instanceof HTMLElement ? ev.target : null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (target?.closest('.select-text') && window.getSelection()?.toString()) return;
      ev.preventDefault();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('contextmenu', onGlobalContextMenu, true);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('contextmenu', onGlobalContextMenu, true);
    };
  }, [init, refreshInPlace, flushPendingSaves, showToast]);

  // 2. Global keyboard shortcuts (reads live store state cleanly without tearing down SSE)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        setCmdkOpen(false);
        setSettingsOpen(false);
        setLinterOpen(false);
        closeCommentPopover();
        return;
      }
      if (isEditableElement(e.target)) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoActiveMachine();
        else undoActiveMachine();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navForward();
      } else if (e.altKey && e.key === 'ArrowUp') {
        const depth = useStudioStore.getState().nestStack.length;
        if (depth > 0) {
          e.preventDefault();
          jumpNestLevel(depth - 2);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    setCmdkOpen,
    navBack,
    navForward,
    jumpNestLevel,
    closeCommentPopover,
    setSettingsOpen,
    setLinterOpen,
    undoActiveMachine,
    redoActiveMachine,
  ]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <main className="w-full h-full relative select-none">
      <TopChrome />

      {loading ? (
        <div
          className="w-full h-full flex items-center justify-center text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          正在加载工作区规格与画布...
        </div>
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center p-6">
          <div className="studio-island max-w-md p-5 text-xs flex flex-col gap-2">
            <div className="font-semibold text-sm" style={{ color: 'var(--red)' }}>
              加载工作区失败
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>{error}</div>
          </div>
        </div>
      ) : activeTab?.kind === 'doc' ? (
        <SpecDocCanvas capId={activeTab.targetId} />
      ) : (
        <StateMachineCanvas />
      )}

      <BottomChrome />
      <WorldlineDrawer />
      <RevisionDrawer />
      <CommentPopover />
      <ChangeDagPanel />
      <PromptWorkbenchModal />
      <SaveGuardModal />
      <ShareDeepLinkModal />
      <SearchPaletteModal />

      {toastMsg && (
        <div
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 rounded-full px-3.5 py-1.5 text-xs shadow-lg pointer-events-none"
          style={{ background: 'var(--ink)', color: '#ffffff' }}
        >
          {toastMsg}
        </div>
      )}
    </main>
  );
}
