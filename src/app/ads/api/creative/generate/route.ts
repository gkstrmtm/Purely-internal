import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdsUser } from "@/lib/adsAuth";
import { generateText } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z
  .object({
    placement: z.enum(["SIDEBAR_BANNER", "TOP_BANNER", "POPUP_CARD"]),
    campaignName: z.string().trim().max(80).optional(),
    linkUrl: z.string().trim().max(500).optional(),
    existing: z
      .object({
        headline: z.string().trim().max(160).optional(),
        body: z.string().trim().max(800).optional(),
        ctaText: z.string().trim().max(80).optional(),
        linkUrl: z.string().trim().max(500).optional(),
      })
      .optional(),
    targeting: z
      .object({
        industries: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
        businessModels: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
        locations: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
      })
      .optional(),
  })
  .strict();

function clampText(s: string, maxLen: number) {
  const v = String(s || "").trim();
  return v.length <= maxLen ? v : v.slice(0, maxLen).trim();
}

function tryParseJson(raw: string): null | { headline?: string; body?: string; ctaText?: string; linkUrl?: string } {
  const s = String(raw || "").trim();
  if (!s) return null;

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    if (!obj || typeof obj !== "object") return null;
    return obj as any;
  } catch {
    return null;
  }
}

function fallbackCopy(input: z.infer<typeof bodySchema>) {
  const industries = (input.targeting?.industries || []).slice(0, 2);
  const businessModels = (input.targeting?.businessModels || []).slice(0, 2);
  const locations = (input.targeting?.locations || []).slice(0, 2);
  const topic = [...industries, ...businessModels].filter(Boolean).join(" · ");
  const locationSuffix = locations.length ? ` in ${locations.join(", ")}` : "";

  const headline = topic ? `Get more ${topic} leads${locationSuffix}` : `Get more leads${locationSuffix || " this week"}`;
  const body =
    input.placement === "TOP_BANNER"
      ? "Promote your offer to portal users actively browsing services."
      : input.placement === "SIDEBAR_BANNER"
        ? "Stay visible while customers explore tools and services."
        : "Show up at the perfect moment with a clean, high-intent popup.";

  return {
    headline: clampText(headline, 160),
    body: clampText(body, 800),
    ctaText: "Learn more",
  };
}

export async function POST(req: Request) {
  await requireAdsUser();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const input = parsed.data;

  const existingHeadline = String(input.existing?.headline || "").trim();
  const existingBody = String(input.existing?.body || "").trim();
  const existingCta = String(input.existing?.ctaText || "").trim();
  const existingLink = String(input.existing?.linkUrl || "").trim();
  const hasExisting = Boolean(existingHeadline || existingBody || existingCta || existingLink);

  const system =
    "You write high-converting, premium ad copy for a small business Ads Manager. " +
    "Be concise. Avoid hype. Do not include emojis. Do not include quotes around fields. " +
    "Return ONLY valid JSON with keys: headline, body, ctaText.";

  const user = [
    "Generate portal ad creative.",
    `Placement: ${input.placement}`,
    input.campaignName ? `Campaign: ${input.campaignName}` : "",
    input.linkUrl ? `Link: ${input.linkUrl}` : "",
    hasExisting ? "" : "",
    hasExisting ? "Existing copy (refine this, don't ignore it):" : "",
    hasExisting ? (existingHeadline ? `- Headline: ${existingHeadline}` : "- Headline: (none)") : "",
    hasExisting ? (existingBody ? `- Body: ${existingBody}` : "- Body: (none)") : "",
    hasExisting ? (existingCta ? `- CTA: ${existingCta}` : "- CTA: (none)") : "",
    hasExisting ? (existingLink ? `- Link: ${existingLink}` : "- Link: (none)") : "",
    "",
    "Targeting:",
    input.targeting?.industries?.length ? `- Industries: ${input.targeting.industries.join(", ")}` : "- Industries: (none)",
    input.targeting?.businessModels?.length
      ? `- Business models: ${input.targeting.businessModels.join(", ")}`
      : "- Business models: (none)",
    input.targeting?.locations?.length ? `- Locations: ${input.targeting.locations.join(", ")}` : "- Locations: (none)",
    "",
    "Constraints:",
    "- headline <= 70 chars recommended (hard cap 160)",
    "- body <= 220 chars recommended (hard cap 800)",
    "- ctaText <= 18 chars recommended (hard cap 80)",
    "",
    "If existing copy is provided, keep the same offer and intent, but improve clarity and conversion.",
  ]
    .filter(Boolean)
    .join("\n");

  let raw = "";
  try {
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4" });
  } catch {
    // fall back below
  }

  const parsedJson = tryParseJson(raw);
  const base = parsedJson ?? fallbackCopy(input);

  const linkUrl =
    base && typeof base === "object" && "linkUrl" in base && typeof (base as any).linkUrl === "string"
      ? clampText((base as any).linkUrl, 500)
      : undefined;

  return NextResponse.json({
    ok: true,
    headline: clampText(base.headline || "", 160) || fallbackCopy(input).headline,
    body: clampText(base.body || "", 800) || fallbackCopy(input).body,
    ctaText: clampText(base.ctaText || "", 80) || "Learn more",
    linkUrl,
  });
}
