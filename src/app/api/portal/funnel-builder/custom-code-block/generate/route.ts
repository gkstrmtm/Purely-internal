import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  funnelId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(4000),
  currentHtml: z.string().optional().default(""),
  currentCss: z.string().optional().default(""),
  contextKeys: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
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

const salesCheckoutButtonBlockSchema = z
  .object({
    type: z.literal("salesCheckoutButton"),
    props: z
      .object({
        priceId: z.string().trim().max(140).optional().default(""),
        quantity: z.number().finite().min(1).max(20).optional(),
        text: z.string().trim().max(120).optional(),
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
  salesCheckoutButtonBlockSchema,
]);

const presetKeySchema = z.enum(["hero", "body", "form", "shop"]);

const aiInsertAfterActionSchema = z
  .object({
    type: z.literal("insertAfter"),
    block: aiInsertableBlockSchema,
  })
  .strip();

const aiInsertPresetAfterActionSchema = z
  .object({
    type: z.literal("insertPresetAfter"),
    preset: presetKeySchema,
  })
  .strip();

const aiActionSchema = z.union([aiInsertAfterActionSchema, aiInsertPresetAfterActionSchema]);

const aiActionsPayloadSchema = z
  .object({
    actions: z.array(aiActionSchema).min(1).max(6),
  })
  .strip();

const aiFormPickSchema = z
  .object({
    pick: z.enum(["default", "bySlug", "byName"]),
    value: z.string().trim().max(120).optional(),
  })
  .strip();

const aiCalendarPickSchema = z
  .object({
    pick: z.enum(["default", "byId", "byTitle"]),
    value: z.string().trim().max(120).optional(),
  })
  .strip();

const aiAnalysisFormLinkBlockSchema = z
  .object({
    type: z.literal("formLink"),
    props: z
      .object({
        form: aiFormPickSchema,
        text: z.string().trim().max(120).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisFormEmbedBlockSchema = z
  .object({
    type: z.literal("formEmbed"),
    props: z
      .object({
        form: aiFormPickSchema,
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisCalendarEmbedBlockSchema = z
  .object({
    type: z.literal("calendarEmbed"),
    props: z
      .object({
        calendar: aiCalendarPickSchema,
        height: z.number().finite().min(120).max(1600).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisSalesCheckoutButtonBlockSchema = z
  .object({
    type: z.literal("salesCheckoutButton"),
    props: z
      .object({
        priceId: z.string().trim().max(140).optional().default(""),
        quantity: z.number().finite().min(1).max(20).optional(),
        text: z.string().trim().max(120).optional(),
        style: blockStyleSchema.optional(),
      })
      .strip(),
  })
  .strip();

const aiAnalysisInsertableBlockSchema = z.discriminatedUnion("type", [
  chatbotBlockSchema,
  imageBlockSchema,
  headingBlockSchema,
  paragraphBlockSchema,
  buttonBlockSchema,
  spacerBlockSchema,
  aiAnalysisFormLinkBlockSchema,
  aiAnalysisFormEmbedBlockSchema,
  aiAnalysisCalendarEmbedBlockSchema,
  aiAnalysisSalesCheckoutButtonBlockSchema,
]);

const aiAnalysisInsertAfterActionSchema = z
  .object({
    type: z.literal("insertAfter"),
    block: aiAnalysisInsertableBlockSchema,
  })
  .strip();

const aiAnalysisInsertPresetAfterActionSchema = z
  .object({
    type: z.literal("insertPresetAfter"),
    preset: presetKeySchema,
  })
  .strip();

const aiAnalysisActionSchema = z.union([aiAnalysisInsertAfterActionSchema, aiAnalysisInsertPresetAfterActionSchema]);

const aiAnalysisPayloadSchema = z
  .object({
    output: z.enum(["actions", "html", "question"]),
    actions: z.array(aiAnalysisActionSchema).min(1).max(6).optional(),
    buildPrompt: z.string().trim().min(1).max(4000).optional(),
    question: z.string().trim().min(1).max(800).optional(),
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

function pickDefaultFormSlug(forms: Array<{ slug: string; name: string; status: string }>): string {
  const active = forms.find((f) => String(f.status).toUpperCase() === "ACTIVE");
  return (active ?? forms[0])?.slug ?? "";
}

function resolveFormSlug(
  pick: z.infer<typeof aiFormPickSchema>,
  forms: Array<{ slug: string; name: string; status: string }>,
): string {
  const fallback = pickDefaultFormSlug(forms);
  if (!forms.length) return "";

  if (pick.pick === "default") return fallback;
  const value = (pick.value ?? "").trim();
  if (!value) return fallback;

  if (pick.pick === "bySlug") {
    const found = forms.find((f) => f.slug.toLowerCase() === value.toLowerCase());
    return found?.slug ?? fallback;
  }

  // byName
  const needle = value.toLowerCase();
  const found = forms.find((f) => (f.name ?? "").toLowerCase() === needle);
  if (found) return found.slug;
  const fuzzy = forms.find((f) => (f.name ?? "").toLowerCase().includes(needle));
  return fuzzy?.slug ?? fallback;
}

function pickDefaultCalendarId(calendars: Array<{ id: string; enabled: boolean; title: string }>): string {
  const enabled = calendars.find((c) => c.enabled);
  return (enabled ?? calendars[0])?.id ?? "";
}

function resolveCalendarId(
  pick: z.infer<typeof aiCalendarPickSchema>,
  calendars: Array<{ id: string; enabled: boolean; title: string }>,
): string {
  const fallback = pickDefaultCalendarId(calendars);
  if (!calendars.length) return "";

  if (pick.pick === "default") return fallback;
  const value = (pick.value ?? "").trim();
  if (!value) return fallback;

  if (pick.pick === "byId") {
    const found = calendars.find((c) => c.id.toLowerCase() === value.toLowerCase());
    return found?.id ?? fallback;
  }

  // byTitle
  const needle = value.toLowerCase();
  const found = calendars.find((c) => (c.title ?? "").toLowerCase() === needle);
  if (found) return found.id;
  const fuzzy = calendars.find((c) => (c.title ?? "").toLowerCase().includes(needle));
  return fuzzy?.id ?? fallback;
}

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const basePath = auth.variant === "credit" ? "/credit" : "/portal";

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { funnelId, pageId, prompt, contextKeys } = parsed.data;
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

  const calendarsConfig = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] }));
  const calendars = (calendarsConfig as any)?.calendars && Array.isArray((calendarsConfig as any).calendars)
    ? ((calendarsConfig as any).calendars as Array<{ id: string; enabled: boolean; title: string }>)
    : ([] as Array<{ id: string; enabled: boolean; title: string }>);

  const hasCurrent = Boolean(currentHtml.trim() || currentCss.trim());

  const contextBlock = contextKeys.length
    ? [
        "",
        "SELECTED_CONTEXT (prefer these building blocks/presets when relevant):",
        ...contextKeys.map((k) => `- ${k}`),
        "",
      ].join("\n")
    : "";

  const buildSystem = [
    "You generate HTML + CSS for a *custom code block* inside a funnel page.",
    "If the request is ambiguous or missing key details, ask ONE concise follow-up question instead of guessing.",
    "Return ONLY code fences, no explanation.",
    "Output options (choose ONE):",
    "A) HTML/CSS (default):",
    "- A single ```html fenced block containing an HTML fragment (no <html>, no <head>).",
    "- Optionally a ```css fenced block for styles used by that fragment.",
    "OR",
    "C) Clarifying question:",
    "- A single ```json fenced block: { \"question\": \"...\" }",
    "B) Funnel blocks (when the request is better represented as built-in blocks like chatbot or images):",
    "- A single ```json fenced block with shape: { actions: [...] }",
    "- Action types:",
    "  - { type: 'insertAfter', block: { type, props } }",
    "  - { type: 'insertPresetAfter', preset: 'hero'|'body'|'form'|'shop' }",
    "- Allowed block types for insertAfter: chatbot, image, heading, paragraph, button, spacer, formLink, formEmbed, calendarEmbed, salesCheckoutButton.",
    "- Do NOT include HTML/CSS fences when you return JSON actions.",
    "Constraints:",
    "- No external JS/CSS, no frameworks.",
    "- Prefer semantic HTML and classes; keep it minimal.",
    "- Make it safe to embed inside an existing page.",
    `- Links should keep the user inside ${basePath}.`,
    "Integration:",
    `- This page is hosted at: ${basePath}/f/${page.funnel.slug}`,
    `- Hosted forms are at: ${basePath}/forms/{formSlug}`,
    "- For booking/scheduling: prefer returning a calendarEmbed block rather than hardcoding a booking URL.",
    "- If the user asks for a shop/store/product list, prefer insertPresetAfter with preset='shop'.",
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Available calendars (id: title [enabled]):",
    ...calendars.map((c) => `- ${c.id}: ${c.title} [${c.enabled ? "enabled" : "disabled"}]`),
    hasCurrent
      ? "Editing mode: you will receive CURRENT_HTML and CURRENT_CSS. Apply the user's instruction as a minimal change and return the full updated fragment + CSS."
      : "Generation mode: create a new fragment + CSS from the user's instruction.",
  ].join("\n");

  const analysisSystem = [
    "You are an intent + asset selector for a funnel builder custom code assistant.",
    "Return ONLY a single ```json fenced block, no other text.",
    "Your job: decide whether to return structured funnel block actions or request an HTML/CSS build.",
    "Output schema:",
    "{",
    "  output: 'actions' | 'html' | 'question',",
    "  actions?: [",
    "    { type: 'insertAfter', block: { type, props } },",
    "    { type: 'insertPresetAfter', preset: 'hero'|'body'|'form'|'shop' }",
    "  ],",
    "  buildPrompt?: string,",
    "  question?: string",
    "}",
    "Rules:",
    "- If user says 'embed my calendar' or anything about booking/scheduling, prefer output='actions' with a calendarEmbed block.",
    "- If user says 'embed my form' or anything about forms, prefer output='actions' with a formEmbed (or formLink if they want a link).",
    "- If user asks for a shop/store/product list, prefer output='actions' with an insertPresetAfter preset='shop'.",
    "- For calendarEmbed, props must include { calendar: { pick: 'default'|'byId'|'byTitle', value? }, height?, style? }.",
    "- For formEmbed/formLink, props must include { form: { pick: 'default'|'bySlug'|'byName', value? }, ... }.",
    "- Use pick='default' for 'my calendar'/'my form' when no specific name/slug is provided.",
    "- For other block types, follow the normal props shapes.",
    "- If output='html', set buildPrompt to a concise instruction for the HTML/CSS generator.",
    "- If key info is missing (e.g., user asks for a shop but doesn't say what they're selling), output='question' and ask ONE question.",
    "Context:",
    `- Funnel page host path: ${basePath}/f/${page.funnel.slug}`,
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Available calendars (id: title [enabled]):",
    ...calendars.map((c) => `- ${c.id}: ${c.title} [${c.enabled ? "enabled" : "disabled"}]`),
  ].join("\n");

  const baseUser = [
    businessContext ? businessContext : "",
    `Funnel: ${page.funnel.name} (slug: ${page.funnel.slug})`,
    `Page: ${page.title} (slug: ${page.slug})`,
    "",
    contextBlock,
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

  // Step 1: analyze intent and select assets.
  let analysisRaw = "";
  try {
    analysisRaw = await generateText({ system: analysisSystem, user: baseUser });
  } catch {
    analysisRaw = "";
  }

  const analysisJsonFence = extractFence(analysisRaw, "json");
  const analysisParsed = analysisJsonFence.trim()
    ? aiAnalysisPayloadSchema.safeParse((() => {
        try {
          return JSON.parse(analysisJsonFence) as unknown;
        } catch {
          return null;
        }
      })())
    : { success: false as const };

  if (analysisParsed.success && analysisParsed.data.output === "question") {
    const q = (analysisParsed.data.question || "").trim();
    if (q) {
      return NextResponse.json({ ok: true, question: q.slice(0, 800) });
    }
  }

  if (analysisParsed.success && analysisParsed.data.output === "actions" && analysisParsed.data.actions?.length) {
    // Resolve asset picks into concrete props.
    const resolvedActions = analysisParsed.data.actions
      .map((a) => {
        if (a.type === "insertPresetAfter") return a;
        const block = a.block as any;
        if (block.type === "formLink" || block.type === "formEmbed") {
          const formSlug = resolveFormSlug(block.props.form, forms);
          const nextProps = { ...block.props };
          delete (nextProps as any).form;
          (nextProps as any).formSlug = formSlug;
          return { type: "insertAfter" as const, block: { type: block.type, props: nextProps } };
        }
        if (block.type === "calendarEmbed") {
          const calendarId = resolveCalendarId(block.props.calendar, calendars);
          const nextProps = { ...block.props };
          delete (nextProps as any).calendar;
          (nextProps as any).calendarId = calendarId;
          return { type: "insertAfter" as const, block: { type: block.type, props: nextProps } };
        }
        return a as any;
      })
      .filter(Boolean);

    const validated = aiActionsPayloadSchema.safeParse({ actions: resolvedActions });
    if (validated.success) {
      return NextResponse.json({ ok: true, actions: validated.data.actions });
    }
  }

  // Step 2: build HTML/CSS (fallback to the original prompt if analysis is missing).
  const buildPrompt = analysisParsed.success && analysisParsed.data.output === "html" && analysisParsed.data.buildPrompt
    ? analysisParsed.data.buildPrompt
    : prompt;

  const buildUser = [
    baseUser,
    "",
    "BUILD_INSTRUCTION:",
    buildPrompt,
  ]
    .filter(Boolean)
    .join("\n");

  let buildRaw = "";
  try {
    buildRaw = await generateText({ system: buildSystem, user: buildUser });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  const buildQuestion = (() => {
    const qFence = extractFence(buildRaw, "json");
    if (!qFence.trim()) return "";
    try {
      const parsed = JSON.parse(qFence) as any;
      return typeof parsed?.question === "string" ? String(parsed.question).trim().slice(0, 800) : "";
    } catch {
      return "";
    }
  })();

  if (buildQuestion) {
    return NextResponse.json({ ok: true, question: buildQuestion });
  }

  const buildJsonFence = extractFence(buildRaw, "json");
  if (buildJsonFence.trim()) {
    try {
      const payload = JSON.parse(buildJsonFence) as unknown;
      const parsedActions = aiActionsPayloadSchema.safeParse(payload);
      if (parsedActions.success) {
        return NextResponse.json({ ok: true, actions: parsedActions.data.actions });
      }
    } catch {
      // ignore: fall back to html/css
    }
  }

  const html = extractFence(buildRaw, "html");
  const css = extractFence(buildRaw, "css");

  if (!html.trim()) {
    return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, html, css });
}
