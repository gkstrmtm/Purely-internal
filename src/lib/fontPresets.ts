export type FontPreset = {
  key: string;
  label: string;
  fontFamily?: string;
  googleFamily?: string;
};

export const FONT_PRESETS: FontPreset[] = [
  { key: "default", label: "Default (app font)" },

  {
    key: "inter",
    label: "Inter",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    googleFamily: "Inter",
  },
  {
    key: "roboto",
    label: "Roboto",
    fontFamily: 'Roboto, ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    googleFamily: "Roboto",
  },
  {
    key: "opensans",
    label: "Open Sans",
    fontFamily: '"Open Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    googleFamily: "Open Sans",
  },
  {
    key: "poppins",
    label: "Poppins",
    fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    googleFamily: "Poppins",
  },
  {
    key: "montserrat",
    label: "Montserrat",
    fontFamily: 'Montserrat, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    googleFamily: "Montserrat",
  },
  {
    key: "playfair",
    label: "Playfair Display",
    fontFamily: '"Playfair Display", ui-serif, Georgia, "Times New Roman", Times, serif',
    googleFamily: "Playfair Display",
  },
  {
    key: "merriweather",
    label: "Merriweather",
    fontFamily: 'Merriweather, ui-serif, Georgia, "Times New Roman", Times, serif',
    googleFamily: "Merriweather",
  },

  { key: "system_sans", label: "System Sans", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" },
  { key: "system_serif", label: "System Serif", fontFamily: "ui-serif, Georgia, 'Times New Roman', Times, serif" },
  { key: "mono", label: "Monospace", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" },
  { key: "arial", label: "Arial", fontFamily: "Arial, Helvetica, sans-serif" },
  { key: "georgia", label: "Georgia", fontFamily: "Georgia, 'Times New Roman', Times, serif" },
];

export function fontPresetKeyFromStyle(style?: { fontFamily?: string; fontGoogleFamily?: string } | null): string {
  const fam = (style?.fontFamily || "").trim();
  const google = (style?.fontGoogleFamily || "").trim();

  if (!fam && !google) return "default";

  for (const p of FONT_PRESETS) {
    if (!p.fontFamily && !p.googleFamily) continue;
    if (p.googleFamily && google && p.googleFamily === google) return p.key;
    if (p.fontFamily && fam && p.fontFamily === fam) return p.key;
  }

  return "custom";
}

export function applyFontPresetToStyle(
  presetKey: string,
): { fontFamily?: string; fontGoogleFamily?: string } {
  if (presetKey === "default") return { fontFamily: undefined, fontGoogleFamily: undefined };
  if (presetKey === "custom") return { fontFamily: undefined, fontGoogleFamily: undefined };

  const preset = FONT_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return { fontFamily: undefined, fontGoogleFamily: undefined };
  return {
    fontFamily: preset.fontFamily,
    fontGoogleFamily: preset.googleFamily,
  };
}

const GOOGLE_FAMILY_TO_QUERY: Record<string, string> = {
  Inter: "Inter:wght@300;400;500;600;700;800",
  Roboto: "Roboto:wght@300;400;500;700;900",
  "Open Sans": "Open+Sans:wght@300;400;500;600;700;800",
  Poppins: "Poppins:wght@300;400;500;600;700;800",
  Montserrat: "Montserrat:wght@300;400;500;600;700;800",
  "Playfair Display": "Playfair+Display:wght@400;500;600;700;800",
  Merriweather: "Merriweather:wght@300;400;700;900",
};

export function googleFontImportCss(googleFamily: string | null | undefined): string | null {
  const fam = typeof googleFamily === "string" ? googleFamily.trim() : "";
  if (!fam) return null;
  const q = GOOGLE_FAMILY_TO_QUERY[fam];
  if (!q) return null;
  return `@import url('https://fonts.googleapis.com/css2?family=${q}&display=swap');`;
}

export function coerceFontFamily(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.replace(/[\r\n\t]/g, " ").trim();
  if (!s) return undefined;
  if (s.length > 200) return undefined;
  return s;
}

export function coerceGoogleFamily(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (s.length > 80) return undefined;
  return GOOGLE_FAMILY_TO_QUERY[s] ? s : undefined;
}
