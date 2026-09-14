/**
 * Locale normalization + fallback chain (init-generators capability, r18).
 * Port of v1 config.rs normalize_locale / locale_fallbacks.
 */
export function normalizeLocale(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return 'en';
  const lower = trimmed.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-hans') || lower === 'zh-cn') return 'zh-Hans';
  if (lower.startsWith('en')) return 'en';
  return trimmed;
}

export function localeFallbacks(locale: string): string[] {
  const normalized = normalizeLocale(locale);
  const locales: string[] = [normalized];
  const dash = normalized.indexOf('-');
  if (dash !== -1) {
    const lang = normalized.slice(0, dash);
    if (!locales.includes(lang)) locales.push(lang);
  }
  if (!locales.includes('en')) locales.push('en');
  return locales;
}
