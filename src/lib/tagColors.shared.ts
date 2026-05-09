export const DEFAULT_TAG_COLORS = [
  "#2563EB", // blue
  "#0EA5E9", // sky
  "#10B981", // emerald
  "#22C55E", // green
  "#F59E0B", // amber
  "#F97316", // orange
  "#EF4444", // red
  "#EC4899", // pink
  "#A855F7", // purple
  "#7C3AED", // violet
  "#64748B", // slate
  "#111827", // ink
] as const;

export type DefaultTagColor = (typeof DEFAULT_TAG_COLORS)[number];

type HexRgb = { r: number; g: number; b: number };

export type TagPillStyleOptions = {
  fallbackTone?: "brand" | "neutral";
};

export function isHexTagColor(value: string | null | undefined): value is `#${string}` {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ""));
}

function readHexRgb(color: `#${string}`): HexRgb {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

function hexWithAlpha(color: `#${string}`, alphaHex: string) {
  return `${color}${alphaHex}`;
}

function yiqLuma({ r, g, b }: HexRgb) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function tintedTextColor({ r, g, b }: HexRgb) {
  return `rgb(${Math.round(r * 0.58)}, ${Math.round(g * 0.58)}, ${Math.round(b * 0.58)})`;
}

export function getReadableTagPillStyle(
  color: string | null | undefined,
  options?: TagPillStyleOptions,
) {
  const fallbackTone = options?.fallbackTone === "brand" ? "brand" : "neutral";
  if (!isHexTagColor(color)) {
    return fallbackTone === "brand"
      ? {
          backgroundColor: "#eff6ff",
          borderColor: "#bfdbfe",
          color: "#1d4ed8",
        }
      : {
          backgroundColor: "rgba(15,23,42,0.08)",
          borderColor: "rgba(148,163,184,0.26)",
          color: "#334155",
        };
  }

  const rgb = readHexRgb(color);
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const luma = yiqLuma(rgb);
  const isGrayish = max - min <= 18;
  const isWhiteish = min >= 245;
  const isYellowish = rgb.r >= 215 && rgb.g >= 170 && rgb.b <= 150;

  if (isWhiteish) {
    return {
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#d4d4d8",
      color: "#334155",
    };
  }

  if (isYellowish) {
    return {
      backgroundColor: hexWithAlpha(color, "24"),
      borderColor: hexWithAlpha(color, "46"),
      color: "#a16207",
    };
  }

  if (isGrayish) {
    return {
      backgroundColor: hexWithAlpha(color, "24"),
      borderColor: hexWithAlpha(color, "4d"),
      color: luma >= 145 ? "#334155" : "#f8fafc",
    };
  }

  return {
    backgroundColor: hexWithAlpha(color, "20"),
    borderColor: hexWithAlpha(color, "40"),
    color: luma >= 168 ? "#334155" : tintedTextColor(rgb),
  };
}
