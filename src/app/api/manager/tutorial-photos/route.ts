import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireManager(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const };
  return { ok: true as const, userId };
}

const CORE_TUTORIALS: { slug: string; label: string; kind: "core" }[] = [
  { slug: "getting-started", label: "Getting started", kind: "core" },
  { slug: "dashboard", label: "Dashboard", kind: "core" },
  { slug: "people", label: "People", kind: "core" },
  { slug: "billing", label: "Billing", kind: "core" },
  { slug: "credits", label: "Credits", kind: "core" },
  { slug: "profile", label: "Profile", kind: "core" },
];

function allTutorials() {
  const serviceTutorials = PORTAL_SERVICES.filter((s) => !s.hidden).map((s) => ({
    slug: s.slug,
    label: s.title,
    kind: "service" as const,
  }));
  return [...CORE_TUTORIALS, ...serviceTutorials];
}

type TutorialSettings = Record<string, { url?: string; photos?: string[] }>;

type PhotosMap = Record<string, string[]>;

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

function encodeTutorialSettingsJson(current: TutorialSettings): Record<string, { url?: string; photos?: string[] }> {
  const out: Record<string, { url?: string; photos?: string[] }> = {};
  for (const [slug, settings] of Object.entries(current)) {
    const url = typeof settings?.url === "string" ? settings.url.trim() : "";
    const photos = Array.isArray(settings?.photos)
      ? settings.photos
          .filter((p) => typeof p === "string")
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, 24)
      : [];

    if (!url && photos.length === 0) continue;
    const next: { url?: string; photos?: string[] } = {};
    if (url) next.url = url;
    if (photos.length) next.photos = photos;
    out[slug] = next;
  }
  return out;
}

function photosMap(current: TutorialSettings): PhotosMap {
  const out: PhotosMap = {};
  for (const [slug, settings] of Object.entries(current)) {
    if (settings.photos?.length) out[slug] = settings.photos;
  }
  return out;
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const auth = requireManager(session);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const tutorials = allTutorials();

  const anyPrisma = prisma as any;
  const table = anyPrisma.tutorialVideoSettings as {
    findUnique: (args: any) => Promise<{ videosJson: unknown } | null>;
  };

  const row = await table
    .findUnique({ where: { id: "singleton" }, select: { videosJson: true } })
    .catch(() => null);

  const settings = parseTutorialSettingsJson(row?.videosJson as unknown);

  return NextResponse.json({ ok: true, tutorials, photos: photosMap(settings) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = requireManager(session);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = (await req.json().catch(() => null)) as
    | { slug?: string; url?: string | null; remove?: boolean }
    | null;

  const slug = (json?.slug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const tutorials = allTutorials();
  const allowed = new Set(tutorials.map((t) => t.slug));
  if (!allowed.has(slug)) {
    return NextResponse.json({ error: "Unknown tutorial slug" }, { status: 400 });
  }

  const urlRaw = typeof json?.url === "string" ? json.url.trim() : "";
  if (!urlRaw) return NextResponse.json({ error: "Missing photo URL" }, { status: 400 });
  if (!isHttpUrl(urlRaw)) {
    return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
  }

  const remove = Boolean(json?.remove);

  const anyPrisma2 = prisma as any;
  const table2 = anyPrisma2.tutorialVideoSettings as {
    findUnique: (args: any) => Promise<{ videosJson: unknown } | null>;
  };

  const existingRow = await table2
    .findUnique({ where: { id: "singleton" }, select: { videosJson: true } })
    .catch(() => null);

  const current = parseTutorialSettingsJson(existingRow?.videosJson as unknown);
  const prev = current[slug] ?? {};

  const photos = Array.isArray(prev.photos) ? prev.photos.slice(0, 24) : [];
  const normalized = urlRaw;

  let nextPhotos = photos;
  if (remove) {
    nextPhotos = photos.filter((p) => p !== normalized);
  } else {
    if (!photos.includes(normalized)) {
      nextPhotos = [normalized, ...photos].slice(0, 24);
    }
  }

  const next = { ...prev };
  if (nextPhotos.length) {
    next.photos = nextPhotos;
  } else {
    delete next.photos;
  }

  if (next.url || next.photos?.length) {
    current[slug] = next;
  } else {
    delete current[slug];
  }

  const nextJson = encodeTutorialSettingsJson(current);

  const upsertAnyPrisma = prisma as any;
  const upsertTable = upsertAnyPrisma.tutorialVideoSettings as {
    upsert: (args: any) => Promise<{ id: string }>;
  };

  await upsertTable.upsert({
    where: { id: "singleton" },
    update: { videosJson: nextJson as any },
    create: { id: "singleton", videosJson: nextJson as any },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
