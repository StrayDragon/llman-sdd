import { Copy, Maximize2, Minimize2, Network, X } from 'lucide-react';
import { render as renderPele } from 'pele';
/**
 * Real-time Change Dependency Panel rendered synchronously via obsidianmd/pele (studio-web r148).
 * Consumes `graphMermaid` directly from `/api/bootstrap` without custom Mermaid rewriting.
 */
import { useMemo } from 'react';

import { useStudioStore } from '../store/studioStore.ts';

export function renderMermaidDiagram(source: string): { svg: string; error: string | null } {
  try {
    const result = renderPele(source || 'flowchart TD\n  empty["No active changes"]');
    return { svg: result.svg, error: null };
  } catch (error) {
    return { svg: '', error: error instanceof Error ? error.message : String(error) };
  }
}

export function ChangeDagPanel() {
  const {
    dagPanelOpen,
    dagFullscreen,
    graphMermaid,
    setDagPanelOpen,
    setDagFullscreen,
    showToast,
  } = useStudioStore();

  const rendered = useMemo(() => {
    if (!dagPanelOpen) return { svg: '', error: null as string | null };
    return renderMermaidDiagram(graphMermaid);
  }, [dagPanelOpen, graphMermaid]);

  if (!dagPanelOpen) return null;

  return (
    <>
      {dagFullscreen && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
          onClick={() => setDagFullscreen(false)}
        />
      )}
      <aside
        aria-label="变更依赖视图"
        className="fixed z-50 studio-float flex flex-col overflow-hidden"
        style={
          dagFullscreen ? { inset: '28px 40px' } : { left: 12, top: 56, bottom: 64, width: 380 }
        }
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-2.5 border-b text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <Network size={13} />
            <span>变更依赖（实时 Mermaid）</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="复制 Mermaid 源码"
              onClick={() => {
                void navigator.clipboard?.writeText(graphMermaid);
                showToast('已复制变更依赖 Mermaid 源码');
              }}
              className="p-1 rounded hover:bg-black/5 cursor-pointer"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              title={dagFullscreen ? '退出全屏' : '全屏查看'}
              onClick={() => setDagFullscreen(!dagFullscreen)}
              className="p-1 rounded hover:bg-black/5 cursor-pointer"
            >
              {dagFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button
              type="button"
              title="关闭"
              onClick={() => {
                setDagFullscreen(false);
                setDagPanelOpen(false);
              }}
              className="p-1 rounded hover:bg-black/5 cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center">
          {rendered.error ? (
            <pre
              className="text-xs font-mono whitespace-pre-wrap"
              style={{ color: 'var(--text-secondary)' }}
            >
              {graphMermaid}
            </pre>
          ) : (
            <div
              className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: rendered.svg }}
            />
          )}
        </div>
      </aside>
    </>
  );
}
