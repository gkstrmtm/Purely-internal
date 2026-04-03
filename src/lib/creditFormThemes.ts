import type { CreditFormStyle, CreditFormSuccessContent } from "@/lib/creditFormSchema";

export type CreditFormThemeKey =
  | "royal-indigo"
  | "ivory-gold"
  | "emerald-clean"
  | "platinum-blue"
  | "midnight-cyan"
  | "rose-slate"
  | "graphite";

export type CreditFormTheme = {
  key: CreditFormThemeKey;
  label: string;
  description: string;
  style: CreditFormStyle;
  successColors: Pick<CreditFormSuccessContent, "accentColor" | "surfaceColor" | "borderColor" | "textColor">;
};

function themeRoyalIndigo(): CreditFormTheme {
  return {
    key: "royal-indigo",
    label: "Royal Indigo",
    description: "Dark + premium (indigo).",
    style: {
      pageBg: "#0b1020",
      cardBg: "#0f1730",
      textColor: "#e9eefc",
      inputBg: "#0b1224",
      inputBorder: "#2a3a6d",
      buttonBg: "#6366f1",
      buttonText: "#ffffff",
      radiusPx: 22,
      submitRadiusPx: 18,
      submitLabel: "Submit",
      fontGoogleFamily: "Inter",
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    },
    successColors: {
      accentColor: "#6366f1",
      surfaceColor: "#0f1730",
      borderColor: "#2a3a6d",
      textColor: "#e9eefc",
    },
  };
}

function themeIvoryGold(): CreditFormTheme {
  return {
    key: "ivory-gold",
    label: "Ivory + Gold",
    description: "Warm + elegant (gold).",
    style: {
      pageBg: "#fffaf0",
      cardBg: "#ffffff",
      textColor: "#1f2937",
      inputBg: "#fffbf5",
      inputBorder: "#e5d3b3",
      buttonBg: "#b45309",
      buttonText: "#ffffff",
      radiusPx: 22,
      submitRadiusPx: 18,
      submitLabel: "Continue",
      fontGoogleFamily: "Playfair Display",
      fontFamily: '"Playfair Display", ui-serif, Georgia, "Times New Roman", Times, serif',
    },
    successColors: {
      accentColor: "#b45309",
      surfaceColor: "#ffffff",
      borderColor: "#f1e6d6",
      textColor: "#1f2937",
    },
  };
}

function themeEmeraldClean(): CreditFormTheme {
  return {
    key: "emerald-clean",
    label: "Emerald Clean",
    description: "Bright + confident (emerald).",
    style: {
      pageBg: "#f0fdf4",
      cardBg: "#ffffff",
      textColor: "#064e3b",
      inputBg: "#ffffff",
      inputBorder: "#a7f3d0",
      buttonBg: "#059669",
      buttonText: "#ffffff",
      radiusPx: 20,
      submitRadiusPx: 16,
      submitLabel: "Submit",
      fontGoogleFamily: "Poppins",
      fontFamily:
        'Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    },
    successColors: {
      accentColor: "#059669",
      surfaceColor: "#ffffff",
      borderColor: "#d1fae5",
      textColor: "#064e3b",
    },
  };
}

function themePlatinumBlue(): CreditFormTheme {
  return {
    key: "platinum-blue",
    label: "Platinum Blue",
    description: "Classic SaaS (blue).",
    style: {
      pageBg: "#f8fafc",
      cardBg: "#ffffff",
      textColor: "#0f172a",
      inputBg: "#ffffff",
      inputBorder: "#cbd5e1",
      buttonBg: "#2563eb",
      buttonText: "#ffffff",
      radiusPx: 22,
      submitRadiusPx: 18,
      submitLabel: "Send",
      fontGoogleFamily: "Montserrat",
      fontFamily:
        'Montserrat, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    },
    successColors: {
      accentColor: "#2563eb",
      surfaceColor: "#ffffff",
      borderColor: "#e2e8f0",
      textColor: "#0f172a",
    },
  };
}

function themeMidnightCyan(): CreditFormTheme {
  return {
    key: "midnight-cyan",
    label: "Midnight Cyan",
    description: "Dark + modern (cyan).",
    style: {
      pageBg: "#050b1a",
      cardBg: "#0b1633",
      textColor: "#e5e7eb",
      inputBg: "#081024",
      inputBorder: "#1f3b79",
      buttonBg: "#06b6d4",
      buttonText: "#001018",
      radiusPx: 22,
      submitRadiusPx: 18,
      submitLabel: "Submit",
      fontGoogleFamily: "Inter",
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    },
    successColors: {
      accentColor: "#06b6d4",
      surfaceColor: "#0b1633",
      borderColor: "#1f3b79",
      textColor: "#e5e7eb",
    },
  };
}

function themeRoseSlate(): CreditFormTheme {
  return {
    key: "rose-slate",
    label: "Rose Slate",
    description: "Soft + premium (rose).",
    style: {
      pageBg: "#fff1f2",
      cardBg: "#ffffff",
      textColor: "#0f172a",
      inputBg: "#ffffff",
      inputBorder: "#fecdd3",
      buttonBg: "#e11d48",
      buttonText: "#ffffff",
      radiusPx: 24,
      submitRadiusPx: 18,
      submitLabel: "Submit",
      fontGoogleFamily: "Open Sans",
      fontFamily:
        '"Open Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    },
    successColors: {
      accentColor: "#e11d48",
      surfaceColor: "#ffffff",
      borderColor: "#ffe4e6",
      textColor: "#0f172a",
    },
  };
}

function themeGraphite(): CreditFormTheme {
  return {
    key: "graphite",
    label: "Graphite",
    description: "Minimal + editorial (graphite).",
    style: {
      pageBg: "#0a0a0a",
      cardBg: "#111827",
      textColor: "#f8fafc",
      inputBg: "#0b1220",
      inputBorder: "#374151",
      buttonBg: "#f8fafc",
      buttonText: "#0a0a0a",
      radiusPx: 20,
      submitRadiusPx: 16,
      submitLabel: "Submit",
      fontGoogleFamily: "Merriweather",
      fontFamily: 'Merriweather, ui-serif, Georgia, "Times New Roman", Times, serif',
    },
    successColors: {
      accentColor: "#f8fafc",
      surfaceColor: "#111827",
      borderColor: "#374151",
      textColor: "#f8fafc",
    },
  };
}

export const CREDIT_FORM_THEMES: CreditFormTheme[] = [
  themeRoyalIndigo(),
  themeIvoryGold(),
  themeEmeraldClean(),
  themePlatinumBlue(),
  themeMidnightCyan(),
  themeRoseSlate(),
  themeGraphite(),
];

export function getCreditFormTheme(key: CreditFormThemeKey | null | undefined): CreditFormTheme | null {
  const k = typeof key === "string" ? (key.trim() as CreditFormThemeKey) : ("" as any);
  if (!k) return null;
  return CREDIT_FORM_THEMES.find((t) => t.key === k) ?? null;
}

export function coerceCreditFormThemeKey(raw: unknown): CreditFormThemeKey | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return (CREDIT_FORM_THEMES.find((t) => t.key === s)?.key as CreditFormThemeKey) ?? null;
}
