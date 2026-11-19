export interface RGB {
  r: number;
  g: number;
  b: number;
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  fuchsia: '#ff00ff',
  purple: '#800080',
  orange: '#ffa500',
  pink: '#ffc0cb',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  lightyellow: '#ffffe0',
  gold: '#ffd700',
  coral: '#ff7f50',
  crimson: '#dc143c',
  indigo: '#4b0082',
  violet: '#ee82ee',
  brown: '#a52a2a',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  salmon: '#fa8072',
  skyblue: '#87ceeb',
  slategray: '#708090',
  slategrey: '#708090',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  wheat: '#f5deb3',
  whitesmoke: '#f5f5f5',
};

export function parseColor(raw: string | null | undefined): RGB | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/!important/g, '').trim();
  if (!value || value === 'transparent' || value === 'inherit' || value === 'initial' || value === 'currentcolor') {
    return null;
  }

  if (NAMED_COLORS[value]) {
    return parseHex(NAMED_COLORS[value]);
  }

  if (value.startsWith('#')) {
    return parseHex(value);
  }

  const rgbMatch = value.match(/^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (rgbMatch) {
    const alphaRaw = rgbMatch[4];
    if (alphaRaw !== undefined) {
      const alpha = alphaRaw.endsWith('%') ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
      if (alpha === 0) return null;
    }
    return {
      r: clampByte(parseInt(rgbMatch[1], 10)),
      g: clampByte(parseInt(rgbMatch[2], 10)),
      b: clampByte(parseInt(rgbMatch[3], 10)),
    };
  }

  const hslMatch = value.match(/^hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (hslMatch) {
    return hslToRgb(
      parseFloat(hslMatch[1]) % 360,
      parseFloat(hslMatch[2]) / 100,
      parseFloat(hslMatch[3]) / 100
    );
  }

  return null;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): RGB | null {
  const clean = hex.replace('#', '');
  if (clean.length === 3 || clean.length === 4) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (clean.length === 6 || clean.length === 8) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** WCAG 2.1 relative luminance */
export function getLuminance({ r, g, b }: RGB): number {
  const linearize = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.1 contrast ratio between 1 and 21 */
export function getContrastRatio(fg: RGB, bg: RGB): number {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      case bn:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;

  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  };
}

/**
 * Adjusts foreground color lightness while preserving hue/saturation
 * until it satisfies the target WCAG contrast ratio against `bg`.
 */
export function findAccessibleColor(fg: RGB, bg: RGB, targetRatio = 4.5): string {
  if (getContrastRatio(fg, bg) >= targetRatio) {
    return rgbToHex(fg);
  }

  const [h, s, l] = rgbToHsl(fg);
  const bgLum = getLuminance(bg);
  // Darken on light backgrounds, lighten on dark backgrounds
  const shouldDarken = bgLum > 0.179;

  let best: RGB | null = null;
  for (let step = 1; step <= 100; step++) {
    const nextL = shouldDarken
      ? Math.max(0, l - step * 0.01)
      : Math.min(1, l + step * 0.01);
    const candidate = hslToRgb(h, s, nextL);
    if (getContrastRatio(candidate, bg) >= targetRatio) {
      best = candidate;
      break;
    }
  }

  if (best) return rgbToHex(best);

  // Fallback to pure dark or pure white whichever has higher contrast
  const blackRatio = getContrastRatio({ r: 17, g: 24, b: 39 }, bg);
  const whiteRatio = getContrastRatio({ r: 255, g: 255, b: 255 }, bg);
  return blackRatio >= whiteRatio ? '#111827' : '#ffffff';
}

export function parseFontSizePx(fontSizeRaw: string | null | undefined): number | null {
  if (!fontSizeRaw) return null;
  const v = fontSizeRaw.trim().toLowerCase();
  const pxMatch = v.match(/^([\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);
  const ptMatch = v.match(/^([\d.]+)pt$/);
  if (ptMatch) return parseFloat(ptMatch[1]) * 1.3333;
  const remMatch = v.match(/^([\d.]+)r?em$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  return null;
}
