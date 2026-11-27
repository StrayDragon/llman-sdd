/**
 * Dual-mode Studio Web static asset resolver (studio-web r147):
 * 1. Compiled single-binary mode: serves embedded assets from LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS
 * 2. Source / npm / dev mode: falls back cleanly to apps/studio/dist/ on disk.
 * Zero Bun.* APIs; uses import.meta.dirname per monorepo-structure r3.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, posix, resolve, sep } from 'node:path';

import type { StudioFocusContext } from '@llman-sdd/core';

export interface EmbeddedAssetEntry {
  encoding: 'utf8' | 'base64';
  content: string;
}

export interface ResolvedStaticAsset {
  bytes: Uint8Array;
  contentType: string;
}

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

function mimeForPath(relPath: string): string {
  return MIME_BY_EXT[extname(relPath).toLowerCase()] ?? 'application/octet-stream';
}

let cachedEmbeddedAssets: Record<string, EmbeddedAssetEntry> | null | undefined;

export function resetEmbeddedStudioAssetsCache(): void {
  cachedEmbeddedAssets = undefined;
}

export function parseEmbeddedStudioAssets(raw: unknown): Record<string, EmbeddedAssetEntry> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, EmbeddedAssetEntry>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, EmbeddedAssetEntry>;
      }
    } catch {
      // Ignore malformed JSON and fall back to disk
    }
  }
  return null;
}

export function resolveEmbeddedStudioAssets(): Record<string, EmbeddedAssetEntry> | null {
  if (cachedEmbeddedAssets !== undefined) return cachedEmbeddedAssets;
  // Bun.build --define injects an object literal directly; runtime env vars are JSON strings.
  const raw = process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_STUDIO_ASSETS as unknown;
  cachedEmbeddedAssets = parseEmbeddedStudioAssets(raw);
  return cachedEmbeddedAssets;
}

/** Locate apps/studio/dist relative to this file in source/workspace/npm layouts. */
export function resolveStudioDistDir(overrideDir?: string): string | null {
  if (overrideDir && existsSync(overrideDir)) return resolve(overrideDir);
  const candidates = [
    resolve(import.meta.dirname, '..', '..', '..', 'studio', 'dist'),
    resolve(import.meta.dirname, '..', '..', 'studio-dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

function normalizeAssetKey(requestPath: string): string | null {
  const stripped = requestPath.replace(/^\/+/u, '');
  const normalized = posix.normalize(stripped === '' ? 'index.html' : stripped);
  if (normalized.startsWith('..') || posix.isAbsolute(normalized)) return null;
  return normalized;
}

export function loadStudioAsset(
  requestPath: string,
  overrideDistDir?: string,
): ResolvedStaticAsset | null {
  const key = normalizeAssetKey(requestPath);
  if (!key) return null;

  const embedded = resolveEmbeddedStudioAssets();
  if (embedded) {
    const hit = embedded[key];
    if (hit) {
      const bytes =
        hit.encoding === 'base64'
          ? Uint8Array.from(Buffer.from(hit.content, 'base64'))
          : new TextEncoder().encode(hit.content);
      return { bytes, contentType: mimeForPath(key) };
    }
  }

  const distDir = resolveStudioDistDir(overrideDistDir);
  if (!distDir) return null;
  const fullPath = resolve(distDir, key);
  if (fullPath !== distDir && !fullPath.startsWith(`${distDir}${sep}`)) return null;
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return null;
  return {
    bytes: new Uint8Array(readFileSync(fullPath)),
    contentType: mimeForPath(key),
  };
}

const FALLBACK_SPA_HTML = `<!doctype html>
<html lang="zh-CN" data-skin="linear">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>llman-sdd Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="application/json" id="studio-focus-context">{}</script>
  </body>
</html>`;

export function renderSpaHtmlWithFocus(
  focusCtx: StudioFocusContext,
  overrideDistDir?: string,
): string {
  const asset = loadStudioAsset('index.html', overrideDistDir);
  const html = asset ? new TextDecoder().decode(asset.bytes) : FALLBACK_SPA_HTML;
  const safeJson = JSON.stringify(focusCtx)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  const scriptTag = `<script type="application/json" id="studio-focus-context">${safeJson}</script>`;
  if (html.includes('id="studio-focus-context"')) {
    return html.replace(
      /<script[^>]*id="studio-focus-context"[^>]*>[\s\S]*?<\/script>/u,
      () => scriptTag,
    );
  }
  return html.replace('</body>', () => `${scriptTag}\n</body>`);
}
