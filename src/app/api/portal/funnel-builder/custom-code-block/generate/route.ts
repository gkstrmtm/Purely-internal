import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  funnelId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(4000),
  currentHtml: z.string().optional().default(""),
  currentCss: z.string().optional().default(""),
});

function clampText(s: string, maxLen: number) {
  const text = String(s || "");
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n/* truncated */";
}

function extractFence(text: string, lang: string): string {
  const re = new RegExp("```" + lang + "\\s*([\\s\\S]*?)\\s*```", "i");
  const m = String(text || "").match(re);
  return m?.[1] ? m[1].trim() : "";
}

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { funnelId, pageId, prompt } = parsed.data;
  const currentHtml = String(parsed.data.currentHtml || "");
  const currentCss = String(parsed.data.currentCss || "");

  // Ensure the funnel/page belongs to the current owner (authorization + context).
  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: {
      id: true,
      slug: true,
      title: true,
      funnel: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ownerId = auth.session.user.id;
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");

  const forms = await prisma.creditForm.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: { slug: true, name: true, status: true },
  });

  const hasCurrent = Boolean(currentHtml.trim() || currentCss.trim());

  const system = [
    "You generate HTML + CSS for a *custom code block* inside a funnel page.",
    "Return ONLY code fences, no explanation.",
    "Output format:",
    "- A single ```html fenced block containing an HTML fragment (no <html>, no <head>).",
    "- Optionally a ```css fenced block for styles used by that fragment.",
    "Constraints:",
    "- No external JS/CSS, no frameworks.",
    "- Prefer semantic HTML and classes; keep it minimal.",
    "- Make it safe to embed inside an existing page.",
    "- Links should keep the user inside /credit.",
    "Integration:",
    `- This page is hosted at: /credit/f/${page.funnel.slug}`,
    "- Credit hosted forms are at: /credit/forms/{formSlug}",
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    hasCurrent
      ? "Editing mode: you will receive CURRENT_HTML and CURRENT_CSS. Apply the user's instruction as a minimal change and return the full updated fragment + CSS."
      : "Generation mode: create a new fragment + CSS from the user's instruction.",
  ].join("\n");

  const user = [
    businessContext ? businessContext : "",
    `Funnel: ${page.funnel.name} (slug: ${page.funnel.slug})`,
    `Page: ${page.title} (slug: ${page.slug})`,
    "",
    hasCurrent
      ? [
          "CURRENT_HTML:",
          "```html",
          clampText(currentHtml, 20000),
          "```",
          "",
          "CURRENT_CSS:",
          "```css",
          clampText(currentCss, 20000),
          "```",
          "",
        ].join("\n")
      : "",
    prompt,
  ]
    .filter(Boolean)
    .join("\n");

  let raw = "";
  try {
    raw = await generateText({ system, user });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  const html = extractFence(raw, "html");
  const css = extractFence(raw, "css");

  if (!html.trim()) {
    return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, html, css });
}
