import { prisma } from "./db";

export type TutorialVideoMap = Record<string, string>;

function parseVideosJson(data: unknown): TutorialVideoMap {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const rec = data as Record<string, unknown>;
  const out: TutorialVideoMap = {};
  for (const [slug, value] of Object.entries(rec)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const v = (value as Record<string, unknown>).url;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    out[slug] = trimmed;
  }
  return out;
}

export async function getTutorialVideoMap(): Promise<TutorialVideoMap> {
  const table = (prisma as any).tutorialVideoSettings as {
    findUnique: (args: any) => Promise<{ videosJson: unknown } | null>;
  } | null;

  if (!table) return {};

  const row = await table
    .findUnique({ where: { id: "singleton" }, select: { videosJson: true } })
    .catch(() => null);

  if (!row) return {};
  return parseVideosJson(row.videosJson as unknown);
}

export async function getTutorialVideoUrl(slug: string): Promise<string | null> {
  const map = await getTutorialVideoMap();
  return map[slug] ?? null;
}
