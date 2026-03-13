import { FONT_PRESETS, googleFontImportCss } from "@/lib/fontPresets";

const SYSTEM_SANS =
  "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"";
const SYSTEM_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

const ALLOWED_FONT_KEYS = new Set<string>(["brand", "sans", "mono", "default", ...FONT_PRESETS.map((p) => p.key)]);

export type HostedFontResolution = {
  fontKey: string;
  fontFamily?: string;
  googleImportCss: string | null;
};

export function normalizeHostedFontKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!key) return "brand";
  return ALLOWED_FONT_KEYS.has(key) ? key : "brand";
}

export function resolveHostedFont(opts: {
  rawFontKey: unknown;
  brandFontFamily?: string | null;
  brandGoogleImportCss?: string | null;
}): HostedFontResolution {
  const fontKey = normalizeHostedFontKey(opts.rawFontKey);

  // "default" means: don't override.
  if (fontKey === "default") {
    return { fontKey, fontFamily: undefined, googleImportCss: null };
  }

  if (fontKey === "brand") {
    const fam = String(opts.brandFontFamily || "").trim();
    return { fontKey, fontFamily: fam || undefined, googleImportCss: opts.brandGoogleImportCss ?? null };
  }

  if (fontKey === "sans") {
    return { fontKey, fontFamily: SYSTEM_SANS, googleImportCss: null };
  }

  if (fontKey === "mono") {
    return { fontKey, fontFamily: SYSTEM_MONO, googleImportCss: null };
  }

  const preset = FONT_PRESETS.find((p) => p.key === fontKey) ?? null;

  return {
    fontKey,
    fontFamily: preset?.fontFamily,
    googleImportCss: googleFontImportCss(preset?.googleFamily),
  };
}

export function buildFontDropdownOptions(): Array<{ value: string; label: string; hint?: string }> {
  const base = [
    { value: "brand", label: "Brand (Business font)" },
    { value: "sans", label: "Sans" },
    { value: "mono", label: "Mono" },
    { value: "default", label: "Default (theme)" },
  ];

  const presets = FONT_PRESETS.map((p) => ({ value: p.key, label: p.label }));
  return [...base, ...presets];
}
