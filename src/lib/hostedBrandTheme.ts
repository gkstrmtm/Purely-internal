import type { CSSProperties } from "react";

import { contrastRatio, parseHexColor, pickReadableAccentColorOnWhite, pickReadableTextColor, rgba } from "@/lib/colorUtils";

function normalizeHex(value: string | null | undefined): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (m3) {
    const [a, b, c] = m3[1].split("");
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (m6) return `#${m6[1]}`.toLowerCase();
  return null;
}

function scoreOnWhite(hex: string): number {
  const white = parseHexColor("#ffffff")!;
  const rgb = parseHexColor(hex);
  if (!rgb) return 0;
  return contrastRatio(white, rgb);
}

function pickBest<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  return best;
}

export type HostedBrandThemeInput = {
  brandPrimaryHex?: string | null;
  brandSecondaryHex?: string | null;
  brandAccentHex?: string | null;
  brandTextHex?: string | null;
  overrides?: {
    bgHex?: string | null;
    surfaceHex?: string | null;
    softHex?: string | null;
    borderHex?: string | null;
    textHex?: string | null;
    mutedTextHex?: string | null;
    primaryHex?: string | null;
    accentHex?: string | null;
    linkHex?: string | null;
  } | null;
};

export type HostedBrandTheme = {
  bgHex: string;
  cardSurfaceHex: string;
  surfaceHex: string;
  linkHex: string;
  ctaHex: string;
  textHex: string;
  mutedTextHex: string;
  onSurfaceHex: string;
  onSurfaceMuted: string;
  onCtaHex: string;
  softHex: string;
  borderHex: string;
  cssVars: CSSProperties;
};

export function deriveHostedBrandTheme(input: HostedBrandThemeInput): HostedBrandTheme {
  const fallbackPrimary = "#1d4ed8";
  const fallbackSecondary = "#22c55e";
  const fallbackAccent = "#fb7185";
  const fallbackText = "#18181b";

  const overrides = input.overrides ?? null;
  const bgHex = normalizeHex(overrides?.bgHex) ?? "#ffffff";
  const cardSurfaceHex = normalizeHex(overrides?.surfaceHex) ?? "#ffffff";

  const rawPrimary = normalizeHex(input.brandPrimaryHex) ?? fallbackPrimary;
  const rawSecondary = normalizeHex(input.brandSecondaryHex) ?? fallbackSecondary;
  const rawAccent = normalizeHex(input.brandAccentHex) ?? fallbackAccent;

  const preferredText = normalizeHex(overrides?.textHex) ?? normalizeHex(input.brandTextHex) ?? fallbackText;
  const textHex = pickReadableTextColor({ backgroundHex: bgHex, preferredTextHex: preferredText, minContrast: 4.5 });
  const mutedTextHex = normalizeHex(overrides?.mutedTextHex) ?? rgba(textHex, 0.72);

  const candidates = Array.from(new Set([rawPrimary, rawSecondary, rawAccent]));

  const derivedSurfaceHex =
    pickBest(candidates, (hex) => {
      const on = pickReadableTextColor({ backgroundHex: hex, preferredTextHex: textHex, minContrast: 4.5 });
      const bgRgb = parseHexColor(hex);
      const onRgb = parseHexColor(on);
      if (!bgRgb || !onRgb) return -Infinity;
      const c = contrastRatio(bgRgb, onRgb);
      // Prefer backgrounds that aren't near-white so hero sections remain visually distinct.
      const whitePenalty = scoreOnWhite(hex) <= 1.4 ? 0 : -0.15;
      return c + whitePenalty;
    }) ?? rawPrimary;

  const surfaceHex = normalizeHex(overrides?.primaryHex) ?? derivedSurfaceHex;

  const onSurfaceHex = pickReadableTextColor({ backgroundHex: surfaceHex, preferredTextHex: textHex, minContrast: 4.5 });
  const onSurfaceMuted = rgba(onSurfaceHex, 0.9);

  const derivedCtaHex =
    pickBest(candidates, (hex) => {
      const on = pickReadableTextColor({ backgroundHex: hex, preferredTextHex: textHex, minContrast: 4.5 });
      const bgRgb = parseHexColor(hex);
      const onRgb = parseHexColor(on);
      if (!bgRgb || !onRgb) return -Infinity;
      const c = contrastRatio(bgRgb, onRgb);
      const avoidSameAsSurface = hex === surfaceHex ? -0.2 : 0;
      return c + avoidSameAsSurface;
    }) ?? rawAccent;

  const ctaHex = normalizeHex(overrides?.accentHex) ?? derivedCtaHex;

  const onCtaHex = pickReadableTextColor({ backgroundHex: ctaHex, preferredTextHex: textHex, minContrast: 4.5 });

  const linkFallback = pickReadableTextColor({ backgroundHex: bgHex, preferredTextHex: textHex, minContrast: 4.5 });
  const linkHex =
    pickBest(candidates, (hex) => {
      const bgRgb = parseHexColor(bgHex);
      const rgb = parseHexColor(hex);
      if (!bgRgb || !rgb) return 0;
      const c = contrastRatio(bgRgb, rgb);
      const avoidSameAsCta = hex === ctaHex ? -0.25 : 0;
      return c + avoidSameAsCta;
    }) ?? rawPrimary;

  const readableLink = (() => {
    const chosen = normalizeHex(overrides?.linkHex) ?? linkHex;
    if (bgHex.toLowerCase() === "#ffffff") {
      return pickReadableAccentColorOnWhite({ accentHex: chosen, fallbackHex: linkFallback, minContrast: 3.0 });
    }
    const bgRgb = parseHexColor(bgHex);
    const accRgb = parseHexColor(chosen);
    if (bgRgb && accRgb && contrastRatio(bgRgb, accRgb) >= 3.0) return chosen;
    return linkFallback;
  })();

  const softHex = normalizeHex(overrides?.softHex) ?? rgba(surfaceHex, 0.08);
  const borderHex = normalizeHex(overrides?.borderHex) ?? rgba(surfaceHex, 0.18);

  const ringHex = rgba(surfaceHex, 0.12);

  const cssVars = {
    ["--client-bg" as any]: bgHex,
    ["--client-surface" as any]: cardSurfaceHex,
    ["--client-primary" as any]: surfaceHex,
    ["--client-secondary" as any]: rawSecondary,
    ["--client-accent" as any]: ctaHex,
    ["--client-text" as any]: textHex,
    ["--client-muted" as any]: mutedTextHex,
    ["--client-on-primary" as any]: onSurfaceHex,
    ["--client-on-primary-muted" as any]: onSurfaceMuted,
    ["--client-on-accent" as any]: onCtaHex,
    ["--client-link" as any]: readableLink,
    ["--client-soft" as any]: softHex,
    ["--client-border" as any]: borderHex,
    ["--client-ring" as any]: ringHex,
  } as CSSProperties;

  return {
    bgHex,
    cardSurfaceHex,
    surfaceHex,
    linkHex: readableLink,
    ctaHex,
    textHex,
    mutedTextHex,
    onSurfaceHex,
    onSurfaceMuted,
    onCtaHex,
    softHex,
    borderHex,
    cssVars,
  };
}
