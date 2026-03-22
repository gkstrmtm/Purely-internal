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
};

export type HostedBrandTheme = {
  surfaceHex: string;
  linkHex: string;
  ctaHex: string;
  textHex: string;
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

  const rawPrimary = normalizeHex(input.brandPrimaryHex) ?? fallbackPrimary;
  const rawSecondary = normalizeHex(input.brandSecondaryHex) ?? fallbackSecondary;
  const rawAccent = normalizeHex(input.brandAccentHex) ?? fallbackAccent;

  const preferredText = normalizeHex(input.brandTextHex) ?? fallbackText;
  const textHex = pickReadableTextColor({ backgroundHex: "#ffffff", preferredTextHex: preferredText, minContrast: 4.5 });

  const candidates = Array.from(new Set([rawPrimary, rawSecondary, rawAccent]));

  const surfaceHex =
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

  const onSurfaceHex = pickReadableTextColor({ backgroundHex: surfaceHex, preferredTextHex: textHex, minContrast: 4.5 });
  const onSurfaceMuted = rgba(onSurfaceHex, 0.9);

  const ctaHex =
    pickBest(candidates, (hex) => {
      const on = pickReadableTextColor({ backgroundHex: hex, preferredTextHex: textHex, minContrast: 4.5 });
      const bgRgb = parseHexColor(hex);
      const onRgb = parseHexColor(on);
      if (!bgRgb || !onRgb) return -Infinity;
      const c = contrastRatio(bgRgb, onRgb);
      const avoidSameAsSurface = hex === surfaceHex ? -0.2 : 0;
      return c + avoidSameAsSurface;
    }) ?? rawAccent;

  const onCtaHex = pickReadableTextColor({ backgroundHex: ctaHex, preferredTextHex: textHex, minContrast: 4.5 });

  const linkFallback = pickReadableTextColor({ backgroundHex: "#ffffff", preferredTextHex: textHex, minContrast: 4.5 });
  const linkHex =
    pickBest(candidates, (hex) => {
      const c = scoreOnWhite(hex);
      const avoidSameAsCta = hex === ctaHex ? -0.25 : 0;
      return c + avoidSameAsCta;
    }) ?? rawPrimary;

  const readableLink = pickReadableAccentColorOnWhite({ accentHex: linkHex, fallbackHex: linkFallback, minContrast: 3.0 });

  const softHex = rgba(surfaceHex, 0.08);
  const borderHex = rgba(surfaceHex, 0.18);

  const cssVars = {
    ["--client-primary" as any]: surfaceHex,
    ["--client-secondary" as any]: rawSecondary,
    ["--client-accent" as any]: ctaHex,
    ["--client-text" as any]: textHex,
    ["--client-on-primary" as any]: onSurfaceHex,
    ["--client-on-primary-muted" as any]: onSurfaceMuted,
    ["--client-on-accent" as any]: onCtaHex,
    ["--client-link" as any]: readableLink,
    ["--client-soft" as any]: softHex,
    ["--client-border" as any]: borderHex,
  } as CSSProperties;

  return {
    surfaceHex,
    linkHex: readableLink,
    ctaHex,
    textHex,
    onSurfaceHex,
    onSurfaceMuted,
    onCtaHex,
    softHex,
    borderHex,
    cssVars,
  };
}
