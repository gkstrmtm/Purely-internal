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

const blockStyleSchema = z
  .object({
    textColor: z.string().trim().max(40).optional(),
    backgroundColor: z.string().trim().max(40).optional(),
    backgroundImageUrl: z.string().trim().max(500).optional(),
    fontSizePx: z.number().finite().min(8).max(96).optional(),
    fontFamily: z.string().trim().max(120).optional(),
    fontGoogleFamily: z.string().trim().max(120).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    marginTopPx: z.number().finite().min(0).max(240).optional(),
    marginBottomPx: z.number().finite().min(0).max(240).optional(),
    paddingPx: z.number().finite().min(0).max(240).optional(),
    borderRadiusPx: z.number().finite().min(0).max(160).optional(),
    borderColor: z.string().trim().max(40).optional(),
    borderWidthPx: z.number().finite().min(0).max(24).optional(),
    maxWidthPx: z.number().finite().min(120).max(1400).optional(),
  })
  .strip();

const chatbotBlockSchema = z
  .object({
    type: z.literal("chatbot"),
    props: z
      .object({
        agentId: z.string().trim().max(120).optional(),
        primaryColor: z.string().trim().max(40).optional(),
        launcherStyle: z.enum(["bubble", "dots", "spark"]).optional(),
        launcherImageUrl: z.string().trim().max(500).optional(),
        placementX: z.enum(["left", "center", "right"]).optional(),
        placementY: z.enum(["top", "middle", "bottom"]).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const imageBlockSchema = z
  .object({
    type: z.literal("image"),
    props: z
      .object({
        src: z.string().trim().max(800),
        alt: z.string().trim().max(200).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const headingBlockSchema = z
  .object({
    type: z.literal("heading"),
    props: z
      .object({
        text: z.string().trim().min(1).max(240),
        level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const paragraphBlockSchema = z
  .object({
    type: z.literal("paragraph"),
    props: z
      .object({
        text: z.string().trim().min(1).max(2000),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const buttonBlockSchema = z
  .object({
    type: z.literal("button"),
    props: z
      .object({
        text: z.string().trim().min(1).max(120),
        href: z.string().trim().min(1).max(600),
        variant: z.enum(["primary", "secondary"]).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const spacerBlockSchema = z
  .object({
    type: z.literal("spacer"),
    props: z
      .object({
        height: z.number().finite().min(0).max(240).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const formLinkBlockSchema = z
  .object({
    type: z.literal("formLink"),
    props: z
      .object({
        formSlug: z.string().trim().min(1).max(120),
        text: z.string().trim().max(120).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const formEmbedBlockSchema = z
  .object({
    type: z.literal("formEmbed"),
    props: z
      .object({
        formSlug: z.string().trim().min(1).max(120),
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const calendarEmbedBlockSchema = z
  .object({
    type: z.literal("calendarEmbed"),
    props: z
      .object({
        calendarId: z.string().trim().min(1).max(120),
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiInsertableBlockSchema = z.discriminatedUnion("type", [
  chatbotBlockSchema,
  imageBlockSchema,
  headingBlockSchema,
  paragraphBlockSchema,
  buttonBlockSchema,
  spacerBlockSchema,
  formLinkBlockSchema,
  formEmbedBlockSchema,
  calendarEmbedBlockSchema,
]);

const aiActionSchema = z
  .object({
    type: z.literal("insertAfter"),
    block: aiInsertableBlockSchema,
  })
  .strip();

const aiActionsPayloadSchema = z
  .object({
    actions: z.array(aiActionSchema).min(1).max(6),
  })
  .strip();

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
    "Output options (choose ONE):",
    "A) HTML/CSS (default):",
    "- A single ```html fenced block containing an HTML fragment (no <html>, no <head>).",
    "- Optionally a ```css fenced block for styles used by that fragment.",
    "B) Funnel blocks (when the request is better represented as built-in blocks like chatbot or images):",
    "- A single ```json fenced block with shape: { actions: [{ type: 'insertAfter', block: { type, props } }] }",
    "- Allowed block types: chatbot, image, heading, paragraph, button, spacer, formLink, formEmbed, calendarEmbed.",
    "- Do NOT include HTML/CSS fences when you return JSON actions.",
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

  const jsonFence = extractFence(raw, "json");
  if (jsonFence.trim()) {
    try {
      const payload = JSON.parse(jsonFence) as unknown;
      const parsedActions = aiActionsPayloadSchema.safeParse(payload);
      if (parsedActions.success) {
        return NextResponse.json({ ok: true, actions: parsedActions.data.actions });
      }
    } catch {
      // ignore: fall back to html/css
    }
  }

  const html = extractFence(raw, "html");
  const css = extractFence(raw, "css");

  if (!html.trim()) {
    return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, html, css });
}
