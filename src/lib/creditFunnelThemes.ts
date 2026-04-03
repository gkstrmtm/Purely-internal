import type { BlockStyle } from "@/lib/creditFunnelBlocks";

export type CreditFunnelThemeKey =
  | "royal-indigo"
  | "emerald-clean"
  | "platinum-blue"
  | "midnight-cyan"
  | "rose-slate"
  | "graphite"
  | "ivory-gold";

export type CreditFunnelTheme = {
  key: CreditFunnelThemeKey;
  label: string;
  description: string;
  pageStyle: BlockStyle;
  headerStyle: BlockStyle;
  headingStyle: BlockStyle;
  paragraphStyle: BlockStyle;
  primaryButtonStyle: BlockStyle;
  secondaryButtonStyle: BlockStyle;
  sectionStyle?: BlockStyle;
};

export const CREDIT_FUNNEL_THEMES: CreditFunnelTheme[] = [
  {
    key: "royal-indigo",
    label: "Royal Indigo",
    description: "Premium, confident, high-converting.",
    pageStyle: {
      backgroundColor: "#0b1020",
      textColor: "#eef2ff",
      fontGoogleFamily: "Inter",
      align: "center",
      paddingPx: 28,
      maxWidthPx: 1060,
    },
    headerStyle: {
      backgroundColor: "rgba(11,16,32,0.75)",
      textColor: "#eef2ff",
      borderColor: "rgba(255,255,255,0.12)",
      borderWidthPx: 1,
    },
    headingStyle: { textColor: "#ffffff" },
    paragraphStyle: { textColor: "rgba(238,242,255,0.86)" },
    primaryButtonStyle: {
      backgroundColor: "#4f46e5",
      textColor: "#ffffff",
      borderRadiusPx: 18,
      paddingPx: 14,
    },
    secondaryButtonStyle: {
      backgroundColor: "rgba(255,255,255,0.08)",
      textColor: "#eef2ff",
      borderColor: "rgba(255,255,255,0.16)",
      borderWidthPx: 1,
      borderRadiusPx: 18,
      paddingPx: 14,
    },
  },
  {
    key: "emerald-clean",
    label: "Emerald Clean",
    description: "Light, modern, and trustworthy.",
    pageStyle: {
      backgroundColor: "#f8fafc",
      textColor: "#0f172a",
      fontGoogleFamily: "Inter",
      align: "center",
      paddingPx: 28,
      maxWidthPx: 1060,
    },
    headerStyle: {
      backgroundColor: "rgba(248,250,252,0.8)",
      textColor: "#0f172a",
      borderColor: "rgba(15,23,42,0.12)",
      borderWidthPx: 1,
    },
    headingStyle: { textColor: "#0f172a" },
    paragraphStyle: { textColor: "rgba(15,23,42,0.78)" },
    primaryButtonStyle: {
      backgroundColor: "#059669",
      textColor: "#ffffff",
      borderRadiusPx: 18,
      paddingPx: 14,
    },
    secondaryButtonStyle: {
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      borderColor: "rgba(15,23,42,0.18)",
      borderWidthPx: 1,
      borderRadiusPx: 18,
      paddingPx: 14,
    },
  },
  {
    key: "platinum-blue",
    label: "Platinum Blue",
    description: "Sharp, tech-forward, and clean.",
    pageStyle: {
      backgroundColor: "#f3f6ff",
      textColor: "#0b1220",
      fontGoogleFamily: "Inter",
      align: "center",
      paddingPx: 28,
      maxWidthPx: 1120,
    },
    headerStyle: {
      backgroundColor: "rgba(243,246,255,0.86)",
      textColor: "#0b1220",
      borderColor: "rgba(11,18,32,0.14)",
      borderWidthPx: 1,
    },
    headingStyle: { textColor: "#0b1220" },
    paragraphStyle: { textColor: "rgba(11,18,32,0.76)" },
    primaryButtonStyle: {
      backgroundColor: "#2563eb",
      textColor: "#ffffff",
      borderRadiusPx: 16,
      paddingPx: 14,
    },
    secondaryButtonStyle: {
      backgroundColor: "rgba(37,99,235,0.08)",
      textColor: "#0b1220",
      borderColor: "rgba(37,99,235,0.25)",
      borderWidthPx: 1,
      borderRadiusPx: 16,
      paddingPx: 14,
    },
  },
  {
    key: "midnight-cyan",
    label: "Midnight Cyan",
    description: "Dark mode with electric accents.",
    pageStyle: {
      backgroundColor: "#020617",
      textColor: "#e2e8f0",
      fontGoogleFamily: "Inter",
      align: "center",
      paddingPx: 28,
      maxWidthPx: 1120,
    },
    headerStyle: {
      backgroundColor: "rgba(2,6,23,0.7)",
      textColor: "#e2e8f0",
      borderColor: "rgba(226,232,240,0.14)",
      borderWidthPx: 1,
    },
    headingStyle: { textColor: "#f8fafc" },
    paragraphStyle: { textColor: "rgba(226,232,240,0.82)" },
    primaryButtonStyle: {
      backgroundColor: "#06b6d4",
      textColor: "#00131a",
      borderRadiusPx: 18,
      paddingPx: 14,
    },
    secondaryButtonStyle: {
      backgroundColor: "rgba(226,232,240,0.08)",
      textColor: "#e2e8f0",
      borderColor: "rgba(226,232,240,0.16)",
      borderWidthPx: 1,
      borderRadiusPx: 18,
      paddingPx: 14,
    },
  },
  {
    key: "rose-slate",
    label: "Rose Slate",
    description: "Warm, modern, and premium.",
    pageStyle: {
      backgroundColor: "#0f172a",
      textColor: "#f8fafc",
      fontGoogleFamily: "Inter",
      align: "center",
      paddingPx: 28,
      maxWidthPx: 1060,
    },
    headerStyle: {
      backgroundColor: "rgba(15,23,42,0.75)",
      textColor: "#f8fafc",
      borderColor: "rgba(248,250,252,0.14)",
      borderWidthPx: 1,
    },
    headingStyle: { textColor: "#f8fafc" },
    paragraphStyle: { textColor: "rgba(248,250,252,0.82)" },
    primaryButtonStyle: {
      backgroundColor: "#fb7185",
      textColor: "#1f2937",
      borderRadiusPx: 18,
      paddingPx: 14,
    },
    secondaryButtonStyle: {
      backgroundColor: "rgba(248,250,252,0.08)",
      textColor: "#f8fafc",
      borderColor: "rgba(248,250,252,0.16)",
      borderWidthPx: 1,
      borderRadiusPx: 18,
      paddingPx: 14,
    },
  },
  {
    key: "graphite",
    label: "Graphite",
    description: "Minimal, high contrast, serious.",
    pageStyle: {
      backgroundColor: "#0b0b0d",
      textColor: "#f4f4f5",
      fontGoogleFamily: "Inter",
      align: "center",
      paddingPx: 28,
      maxWidthPx: 1120,
    },
    headerStyle: {
      backgroundColor: "rgba(11,11,13,0.75)",
      textColor: "#f4f4f5",
      borderColor: "rgba(244,244,245,0.12)",
      borderWidthPx: 1,
    },
    headingStyle: { textColor: "#ffffff" },
    paragraphStyle: { textColor: "rgba(244,244,245,0.82)" },
    primaryButtonStyle: {
      backgroundColor: "#ffffff",
      textColor: "#0b0b0d",
      borderRadiusPx: 14,
      paddingPx: 14,
    },
    secondaryButtonStyle: {
      backgroundColor: "rgba(255,255,255,0.06)",
      textColor: "#f4f4f5",
      borderColor: "rgba(244,244,245,0.16)",
      borderWidthPx: 1,
      borderRadiusPx: 14,
      paddingPx: 14,
    },
  },
  {
    key: "ivory-gold",
    label: "Ivory + Gold",
    description: "Elegant, luxury, premium.",
    pageStyle: {
      backgroundColor: "#fffaf1",
      textColor: "#1f2937",
      fontGoogleFamily: "Inter",
      align: "center",
      paddingPx: 28,
      maxWidthPx: 1060,
    },
    headerStyle: {
      backgroundColor: "rgba(255,250,241,0.9)",
      textColor: "#1f2937",
      borderColor: "rgba(31,41,55,0.14)",
      borderWidthPx: 1,
    },
    headingStyle: { textColor: "#111827" },
    paragraphStyle: { textColor: "rgba(31,41,55,0.78)" },
    primaryButtonStyle: {
      backgroundColor: "#b45309",
      textColor: "#fffaf1",
      borderRadiusPx: 18,
      paddingPx: 14,
    },
    secondaryButtonStyle: {
      backgroundColor: "#ffffff",
      textColor: "#1f2937",
      borderColor: "rgba(180,83,9,0.28)",
      borderWidthPx: 1,
      borderRadiusPx: 18,
      paddingPx: 14,
    },
  },
];

export function getCreditFunnelTheme(key: CreditFunnelThemeKey | string | null | undefined): CreditFunnelTheme | null {
  const k = typeof key === "string" ? (key as CreditFunnelThemeKey) : null;
  if (!k) return null;
  return CREDIT_FUNNEL_THEMES.find((t) => t.key === k) || null;
}

export function coerceCreditFunnelThemeKey(raw: unknown): CreditFunnelThemeKey | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim() as CreditFunnelThemeKey;
  if (!s) return null;
  return CREDIT_FUNNEL_THEMES.some((t) => t.key === s) ? s : null;
}
