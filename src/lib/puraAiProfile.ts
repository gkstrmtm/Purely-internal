export const PURA_AI_PROFILE_VALUES = ["fast", "balanced", "deep"] as const;

export type PuraAiProfile = (typeof PURA_AI_PROFILE_VALUES)[number];

export function normalizePuraAiProfile(raw: unknown): PuraAiProfile {
  if (raw === "fast" || raw === "deep") return raw;
  return "balanced";
}

export const PURA_AI_PROFILE_OPTIONS: Array<{
  value: PuraAiProfile;
  label: string;
  description: string;
}> = [
  { value: "fast", label: "Fast", description: "Quick turnaround for lighter tasks." },
  { value: "balanced", label: "Balanced", description: "Best mix of speed and depth." },
  { value: "deep", label: "Deep", description: "More deliberate for harder work." },
];