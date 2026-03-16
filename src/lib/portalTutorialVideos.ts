import { prisma } from "./db";

export type TutorialVideoMap = Record<string, string>;
export type TutorialPhotoMap = Record<string, string[]>;

type TutorialSettings = Record<string, { url?: string; photos?: string[] }>;

function parseTutorialSettingsJson(data: unknown): TutorialSettings {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const rec = data as Record<string, unknown>;
  const out: TutorialSettings = {};

  for (const [slug, value] of Object.entries(rec)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const obj = value as Record<string, unknown>;

    const settings: { url?: string; photos?: string[] } = {};

    const url = obj.url;
    if (typeof url === "string") {
      const trimmed = url.trim();
      if (trimmed) settings.url = trimmed;
    }

    const photos = obj.photos;
    if (Array.isArray(photos)) {
      const urls = photos
        .filter((p) => typeof p === "string")
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 24);
      if (urls.length) settings.photos = urls;
    }

    if (settings.url || settings.photos?.length) out[slug] = settings;
  }

  return out;
}

function parseVideosJson(data: unknown): TutorialVideoMap {
  const settings = parseTutorialSettingsJson(data);
  const out: TutorialVideoMap = {};
  for (const [slug, s] of Object.entries(settings)) {
    if (s.url) out[slug] = s.url;
  }
  return out;
}

function parsePhotosJson(data: unknown): TutorialPhotoMap {
  const settings = parseTutorialSettingsJson(data);
  const out: TutorialPhotoMap = {};
  for (const [slug, s] of Object.entries(settings)) {
    if (s.photos?.length) out[slug] = s.photos;
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

export async function getTutorialPhotoMap(): Promise<TutorialPhotoMap> {
  const table = (prisma as any).tutorialVideoSettings as {
    findUnique: (args: any) => Promise<{ videosJson: unknown } | null>;
  } | null;

  if (!table) return {};

  const row = await table
    .findUnique({ where: { id: "singleton" }, select: { videosJson: true } })
    .catch(() => null);

  if (!row) return {};
  return parsePhotosJson(row.videosJson as unknown);
}

export async function getTutorialVideoUrl(slug: string): Promise<string | null> {
  const map = await getTutorialVideoMap();
  return map[slug] ?? null;
}

export async function getTutorialPhotoUrls(slug: string): Promise<string[]> {
  const map = await getTutorialPhotoMap();
  return map[slug] ?? [];
}
