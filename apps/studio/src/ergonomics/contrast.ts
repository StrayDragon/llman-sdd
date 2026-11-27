// WCAG 2.1 non-text contrast tokens & verification helpers for both light skins (r157).
// Ensures default edges and crisp borders stay >= 3.0:1 against canvas background at 50%-75% zoom.

export interface SkinContrastPalette {
  skin: 'linear' | 'washi';
  canvasBg: string;
  cardBorder: string;
  borderStrong: string;
  edgeDefault: string;
  edgeManual: string;
  groupTeal: string;
  groupBlue: string;
  groupAmber: string;
  groupViolet: string;
}

export const STUDIO_CONTRAST_PALETTES: Record<'linear' | 'washi', SkinContrastPalette> = {
  linear: {
    skin: 'linear',
    canvasBg: '#f5f6f8',
    cardBorder: '#c4cddb',
    borderStrong: '#7e8ca1',
    edgeDefault: '#5c6b82',
    edgeManual: '#475569',
    groupTeal: '#549e92',
    groupBlue: '#6c85df',
    groupAmber: '#b88342',
    groupViolet: '#8b66dc',
  },
  washi: {
    skin: 'washi',
    canvasBg: '#f9f8f4',
    cardBorder: '#ccc3b4',
    borderStrong: '#82786a',
    edgeDefault: '#665d51',
    edgeManual: '#4f483e',
    groupTeal: '#b36b4c',
    groupBlue: '#688641',
    groupAmber: '#8c7e6c',
    groupViolet: '#8b66dc',
  },
};

export const MIN_NON_TEXT_CONTRAST = 3.0;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/u, '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : clean;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelLum(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}
