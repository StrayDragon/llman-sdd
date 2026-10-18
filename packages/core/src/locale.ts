/**
 * Locale normalization + fallback chain (init-generators capability, r18).
 * Single built-in locale: every recognizable prefix (zh / zh-cn / zh-hans and
 * the en family) and every unknown value normalizes to `zh-Hans`. The branch
 * shape is kept so an English template pack can be re-added later without
 * touching callers.
 */

/** The one built-in template locale: default value, fallback tail and CLI floor. */
export const DEFAULT_LOCALE = 'zh-Hans';

export function normalizeLocale(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return DEFAULT_LOCALE;
  const lower = trimmed.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-hans') || lower === 'zh-cn') return DEFAULT_LOCALE;
  if (lower.startsWith('en')) return DEFAULT_LOCALE;
  // Unknown values normalize instead of passing through: with no English pack,
  // an unlisted locale would render nothing at all.
  return DEFAULT_LOCALE;
}

export function localeFallbacks(locale: string): string[] {
  const normalized = normalizeLocale(locale);
  const locales: string[] = [normalized];
  const dash = normalized.indexOf('-');
  if (dash !== -1) {
    const lang = normalized.slice(0, dash);
    if (!locales.includes(lang)) locales.push(lang);
  }
  if (!locales.includes(DEFAULT_LOCALE)) locales.push(DEFAULT_LOCALE);
  return locales;
}
