/**
 * Localized stage-progress notes (B1): genuinely long-running operations print
 * a short one-line stderr note in the project locale (zh → zh-Hans text,
 * everything else English) so neither humans nor agents mistake progress for a
 * hang. Progress ALWAYS goes to stderr (capture contract: results on stdout,
 * progress on stderr); each key fires at most once per process; notes are only
 * emitted before the long op itself, never ahead of domain errors.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Locale = 'zh' | 'en';

const NOTES: Record<string, Record<Locale, string>> = {
  'context.retrieve': {
    zh: '正在检索 specs 上下文(LLM)...',
    en: 'Retrieving spec context (LLM)...',
  },
  'init.generate': {
    zh: '正在初始化 llmanspec/ 与 skills...',
    en: 'Initializing llmanspec/ and skills...',
  },
  'freeze.pack': {
    zh: '正在压缩冻结归档(7z)...',
    en: 'Packing freeze archive (7z)...',
  },
  'thaw.unpack': {
    zh: '正在解包冻结归档(7z)...',
    en: 'Unpacking freeze archive (7z)...',
  },
};

/** Resolve the note text for a locale (pure; exported for unit tests). */
export function resolveNote(key: string, locale: Locale): string | undefined {
  return NOTES[key]?.[locale];
}

/** Detect the project locale from llmanspec/config.yaml (zh-* → zh, else en). */
export function detectLocale(cwd: string): Locale {
  try {
    const cfg = readFileSync(join(cwd, 'llmanspec', 'config.yaml'), 'utf8');
    const m = cfg.match(/^locale:\s*([A-Za-z-]+)/mu);
    if (m?.[1]?.startsWith('zh') ?? false) return 'zh';
  } catch {
    // No config at cwd — English fallback.
  }
  return 'en';
}

const shown = new Set<string>();

/** Print a localized progress note to stderr once per key per process. */
export function progressNote(key: string, cwd: string = process.cwd()): void {
  if (shown.has(key)) return;
  const text = resolveNote(key, detectLocale(cwd));
  if (text === undefined) return;
  shown.add(key);
  process.stderr.write(`${text}\n`);
}
