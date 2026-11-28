// Read-only HD SVG / PNG visual snapshot exporter for Studio canvases (r157).
// Strictly visual export only (zero .canvas / Excalidraw bidirectional format burden).
import { toPng, toSvg } from 'html-to-image';

import { STUDIO_CONTRAST_PALETTES } from './contrast.ts';

export type SnapshotFormat = 'svg' | 'png';
export type SnapshotScope = 'canvas' | 'selected';

export interface SnapshotExportOptions {
  format: SnapshotFormat;
  scope: SnapshotScope;
  includeHeader: boolean;
  skin: 'linear' | 'washi';
  title: string;
  subtitle?: string;
}

export function buildSnapshotFileName(title: string, format: SnapshotFormat): string {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replaceAll(/[^\w\u4E00-\u9FA5-]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '') || 'studio-canvas';
  return `llman-studio-${slug}.${format}`;
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

export async function exportStudioCanvasSnapshot(
  opts: SnapshotExportOptions,
): Promise<{ filename: string; bytes: number }> {
  const target =
    document.querySelector<HTMLElement>('.react-flow') ??
    document.querySelector<HTMLElement>('main');
  if (!target) {
    throw new Error('当前视图没有可导出的画布区域');
  }

  const palette = STUDIO_CONTRAST_PALETTES[opts.skin];
  const filter = (node: HTMLElement): boolean => {
    if (!(node instanceof Element)) return true;
    if (
      node.classList.contains('react-flow__minimap') ||
      node.classList.contains('react-flow__controls') ||
      node.classList.contains('studio-float') ||
      node.classList.contains('radial-menu')
    ) {
      return false;
    }
    if (opts.scope === 'selected' && node.classList.contains('react-flow__node')) {
      const hasAnySelected = target.querySelector('.react-flow__node.selected') !== null;
      if (hasAnySelected && !node.classList.contains('selected')) {
        return false;
      }
    }
    return true;
  };

  let headerBanner: HTMLDivElement | null = null;
  if (opts.includeHeader) {
    headerBanner = document.createElement('div');
    headerBanner.dataset.snapshotHeader = '1';
    headerBanner.style.cssText = [
      'position:absolute',
      'top:12px',
      'left:16px',
      'z-index:99',
      'padding:6px 12px',
      'border-radius:8px',
      `background:${palette.canvasBg}`,
      `border:1px solid ${palette.borderStrong}`,
      'font-size:12px',
      'font-weight:600',
      'color:#171b24',
      'pointer-events:none',
    ].join(';');
    headerBanner.textContent = opts.subtitle ? `${opts.title} · ${opts.subtitle}` : opts.title;
    target.append(headerBanner);
  }

  try {
    const common = {
      backgroundColor: palette.canvasBg,
      pixelRatio: 2,
      cacheBust: true,
      filter,
    };
    const dataUrl =
      opts.format === 'svg' ? await toSvg(target, common) : await toPng(target, common);
    const filename = buildSnapshotFileName(opts.title, opts.format);
    triggerDownload(dataUrl, filename);
    return { filename, bytes: dataUrl.length };
  } finally {
    headerBanner?.remove();
  }
}
