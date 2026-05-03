export type FunnelDesignContext = {
  designBrief?: string;
  fontDirection?: string;
  vibeKeywords?: string[];
  colorDirection?: string;
  designConcepts?: string;
  avoid?: string;
};

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanStringList(value: unknown, maxItems: number, maxLen: number) {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      const next = cleanString(item, maxLen);
      if (!next || out.includes(next)) continue;
      out.push(next);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, maxItems)
      .map((item) => item.slice(0, maxLen));
  }

  return [] as string[];
}

export function sanitizeFunnelDesignContext(raw: unknown): FunnelDesignContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const next: FunnelDesignContext = {
    designBrief: cleanString(record.designBrief, 1600),
    fontDirection: cleanString(record.fontDirection, 400),
    vibeKeywords: cleanStringList(record.vibeKeywords, 8, 40),
    colorDirection: cleanString(record.colorDirection, 320),
    designConcepts: cleanString(record.designConcepts, 900),
    avoid: cleanString(record.avoid, 600),
  };

  return hasFunnelDesignContext(next) ? next : null;
}

export function hasFunnelDesignContext(value: FunnelDesignContext | null | undefined) {
  if (!value) return false;
  return Boolean(
    cleanString(value.designBrief, 10) ||
      cleanString(value.fontDirection, 10) ||
      cleanString(value.colorDirection, 10) ||
      cleanString(value.designConcepts, 10) ||
      cleanString(value.avoid, 10) ||
      cleanStringList(value.vibeKeywords, 1, 40).length,
  );
}

export function buildFunnelDesignContextPromptBlock(value: FunnelDesignContext | null | undefined, heading = "DESIGN_DIRECTION") {
  const context = sanitizeFunnelDesignContext(value);
  if (!context) return "";

  const lines = [heading + ":"];
  if (context.designBrief) lines.push(`- Art direction brief: ${context.designBrief}`);
  if (context.fontDirection) lines.push(`- Font direction: ${context.fontDirection}`);
  if (context.vibeKeywords?.length) lines.push(`- Vibe keywords: ${context.vibeKeywords.join(", ")}`);
  if (context.colorDirection) lines.push(`- Color direction: ${context.colorDirection}`);
  if (context.designConcepts) lines.push(`- Design concepts and references: ${context.designConcepts}`);
  if (context.avoid) lines.push(`- Avoid: ${context.avoid}`);
  lines.push("- Treat font direction as a real typography brief. If exact families are unavailable, match the intended character, hierarchy, and contrast with the closest viable alternative.");
  lines.push("- Use vibe keywords and design concepts to shape composition, spacing, surfaces, contrast, and proof treatment, not just copy adjectives.");
  return lines.join("\n");
}