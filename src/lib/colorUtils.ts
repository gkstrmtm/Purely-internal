export type Rgb = { r: number; g: number; b: number };

export function parseHexColor(hex: string): Rgb | null {
  const v = hex.trim();
  const m = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { r, g, b };
}

function srgbToLinear(x: number): number {
  const v = x / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: Rgb): number {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function rgba(hex: string, alpha: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

export function pickReadableTextColor(opts: {
  backgroundHex: string;
  preferredTextHex?: string | null;
  minContrast?: number;
}): string {
  const minContrast = opts.minContrast ?? 4.5;
  const bg = parseHexColor(opts.backgroundHex);
  if (!bg) return "#18181b";

  const preferred = opts.preferredTextHex ? parseHexColor(opts.preferredTextHex) : null;
  if (preferred && contrastRatio(bg, preferred) >= minContrast) return String(opts.preferredTextHex);

  const white = parseHexColor("#ffffff")!;
  const ink = parseHexColor("#18181b")!;

  const cWhite = contrastRatio(bg, white);
  const cInk = contrastRatio(bg, ink);
  return cWhite >= cInk ? "#ffffff" : "#18181b";
}

export function pickReadableAccentColorOnWhite(opts: {
  accentHex: string;
  fallbackHex: string;
  minContrast?: number;
}): string {
  const minContrast = opts.minContrast ?? 3.0;
  const white = parseHexColor("#ffffff")!;
  const accent = parseHexColor(opts.accentHex);
  if (accent && contrastRatio(white, accent) >= minContrast) return opts.accentHex;
  return opts.fallbackHex;
}
