import { FONT_PRESETS, googleFontImportCss } from "@/lib/fontPresets";

const ALLOWED_FONT_KEYS = new Set<string>(["brand", "sans", "mono", ...FONT_PRESETS.map((p) => p.key)]);

export function normalizeNewsletterFontKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!key) return "brand";
  return ALLOWED_FONT_KEYS.has(key) ? key : "brand";
}

export function resolveNewsletterHostedFont(rawFontKey: unknown): {
  fontKey: string;
  className: string;
  style?: { fontFamily?: string };
  googleImportCss: string | null;
} {
  const fontKey = normalizeNewsletterFontKey(rawFontKey);

  if (fontKey === "brand") {
    return { fontKey, className: "font-brand", googleImportCss: null };
  }
  if (fontKey === "sans") {
    return { fontKey, className: "font-sans", googleImportCss: null };
  }
  if (fontKey === "mono") {
    return { fontKey, className: "font-mono", googleImportCss: null };
  }

  const preset = FONT_PRESETS.find((p) => p.key === fontKey) ?? null;
  const googleImportCss = googleFontImportCss(preset?.googleFamily);

  // "default" just means: don't override.
  if (fontKey === "default") {
    return { fontKey, className: "", googleImportCss: null };
  }

  return {
    fontKey,
    className: "",
    style: preset?.fontFamily ? { fontFamily: preset.fontFamily } : undefined,
    googleImportCss,
  };
}

export function stripLegacyNewsletterFontWrapper(markdown: string): string {
  const md = String(markdown || "").trim();
  if (!md) return md;

  const m = md.match(/^<div\s+class="[^"]*\bfont-(?:brand|sans|mono)\b[^"]*">\s*\n\n?([\s\S]*)\n\n?<\/div>\s*$/i);
  if (!m) return md;
  return String(m[1] || "").trim();
}
