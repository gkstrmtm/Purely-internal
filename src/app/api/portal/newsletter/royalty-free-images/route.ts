import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
  take: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const n = Number.parseInt(String(v || ""), 10);
      if (!Number.isFinite(n)) return 10;
      return Math.max(1, Math.min(20, n));
    }),
});

type CommonsImage = { url: string; thumbUrl: string; mime: string; title: string; sourcePage: string };

async function searchCommonsImages(q: string, take: number): Promise<CommonsImage[]> {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("generator", "search");
  api.searchParams.set("gsrsearch", `${q} filetype:bitmap`);
  api.searchParams.set("gsrlimit", String(Math.max(5, Math.min(20, take * 3))));
  api.searchParams.set("gsrnamespace", "6"); // File:
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url|mime");
  api.searchParams.set("iiurlwidth", "1400");

  const res = await fetch(api.toString(), {
    method: "GET",
    headers: { "user-agent": "purelyautomation/portal-newsletter" },
    cache: "no-store",
  });

  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as any;

  const pages = json?.query?.pages && typeof json.query.pages === "object" ? Object.values(json.query.pages) : [];
  const out: CommonsImage[] = [];

  for (const p of pages as any[]) {
    const title = String(p?.title || "");
    const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
    const url = typeof info?.url === "string" ? info.url : null;
    const thumbUrl = typeof info?.thumburl === "string" ? info.thumburl : url;
    const mime = typeof info?.mime === "string" ? info.mime : "";
    if (!url || !thumbUrl) continue;
    if (mime && !mime.startsWith("image/")) continue;

    const sourcePage = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/\s/g, "_"))}`;
    out.push({ url, thumbUrl, mime: mime || "image/*", title, sourcePage });
    if (out.length >= take) break;
  }

  return out;
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "", take: url.searchParams.get("take") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }

  const items = await searchCommonsImages(parsed.data.q, parsed.data.take);

  return NextResponse.json({
    ok: true,
    images: items.map((i) => ({
      url: i.url,
      thumbUrl: i.thumbUrl,
      title: i.title,
      sourcePage: i.sourcePage,
      mime: i.mime,
    })),
  });
}
