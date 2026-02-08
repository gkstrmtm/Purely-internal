import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  subtitle: z.string().trim().max(140).optional(),
  v: z.string().trim().max(40).optional(),
});

function hashString(input: string): number {
  // Simple deterministic hash (djb2-ish)
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], idx: number): T {
  return arr[Math.abs(idx) % arr.length];
}

function escapeXml(text: string) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    title: url.searchParams.get("title") ?? undefined,
    subtitle: url.searchParams.get("subtitle") ?? undefined,
    v: url.searchParams.get("v") ?? undefined,
  });

  const title = parsed.success ? parsed.data.title : undefined;
  const subtitle = parsed.success ? parsed.data.subtitle : undefined;
  const variant = parsed.success ? parsed.data.v : undefined;

  const t = escapeXml(title || "Blog post");
  const s = escapeXml(subtitle || "Purely Automation");

  const seed = hashString(`${title || ""}|${subtitle || ""}|${variant || ""}`);
  const accentPairs: Array<{ a: string; b: string }> = [
    { a: "#60a5fa", b: "#fb7185" },
    { a: "#34d399", b: "#60a5fa" },
    { a: "#a78bfa", b: "#fb7185" },
    { a: "#fbbf24", b: "#60a5fa" },
    { a: "#22c55e", b: "#a78bfa" },
  ];
  const pair = pick(accentPairs, seed);

  const blobs = [
    { cx: 1040, cy: 140, r: 140, o: 0.22 },
    { cx: 1080, cy: 520, r: 180, o: 0.16 },
    { cx: 140, cy: 520, r: 220, o: 0.12 },
  ];
  const blobA = pick(blobs, seed + 1);
  const blobB = pick(blobs, seed + 2);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="60%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0b1220"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${pair.a}"/>
      <stop offset="100%" stop-color="${pair.b}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="${blobA.cx}" cy="${blobA.cy}" r="${blobA.r}" fill="url(#accent)" opacity="${blobA.o}"/>
  <circle cx="${blobB.cx}" cy="${blobB.cy}" r="${blobB.r}" fill="url(#accent)" opacity="${blobB.o}"/>
  <rect x="64" y="70" width="1072" height="490" rx="32" fill="#0b1220" opacity="0.55" filter="url(#shadow)"/>
  <rect x="64" y="70" width="1072" height="8" fill="url(#accent)" opacity="0.9"/>

  <text x="96" y="165" fill="#e2e8f0" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="54" font-weight="800">
    ${t}
  </text>

  <text x="96" y="230" fill="#94a3b8" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="24" font-weight="600">
    ${s}
  </text>

  <text x="96" y="520" fill="#94a3b8" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="20" font-weight="600">
    purelyautomation.com
  </text>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
