import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { generateText } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  prompt: z.string().trim().min(2).max(200),
  take: z.number().int().min(1).max(20).optional().default(10),
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

function normalizeQuery(raw: string): string {
  const firstLine = String(raw || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  const cleaned = String(firstLine || raw || "")
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[^a-zA-Z0-9\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 100);
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const prompt = parsed.data.prompt;
  const take = parsed.data.take;
  const ownerId = auth.session.user.id;
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");

  const canUseAi = Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY);

  let query = prompt;
  if (canUseAi) {
    try {
      const system = [
        "You write concise Wikimedia Commons search queries.",
        "Return only the query text.",
        "No punctuation, no quotes, no extra words.",
        "Prefer 3 to 8 words.",
      ].join("\n");
      const user = [businessContext, `Prompt: ${prompt}`, "", "Search query:"]
        .filter(Boolean)
        .join("\n\n");
      const raw = await generateText({ system, user });
      const normalized = normalizeQuery(raw);
      if (normalized.length >= 2) query = normalized;
    } catch {
      // Fallback to using the prompt directly.
      query = prompt;
    }
  }

  const images = await searchCommonsImages(query, take);

  return NextResponse.json({
    ok: true,
    query,
    images: images.map((i) => ({
      url: i.url,
      thumbUrl: i.thumbUrl,
      title: i.title,
      sourcePage: i.sourcePage,
      mime: i.mime,
    })),
  });
}
