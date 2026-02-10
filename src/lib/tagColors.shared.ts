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
