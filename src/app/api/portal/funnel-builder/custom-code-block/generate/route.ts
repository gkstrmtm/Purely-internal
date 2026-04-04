import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText, generateTextWithImages } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  funnelId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(4000),
  currentHtml: z.string().optional().default(""),
  currentCss: z.string().optional().default(""),
  contextKeys: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  contextMedia: z
    .array(
      z
        .object({
          url: z.string().trim().min(1).max(800),
          fileName: z.string().trim().max(200).optional(),
          mimeType: z.string().trim().max(120).optional(),
        })
        .strip(),
    )
    .max(24)
    .optional()
    .default([]),
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

function extractInlineStyleTags(html: string): { html: string; css: string } {
  const h = String(html || "");
  if (!h.trim()) return { html: "", css: "" };

  const cssParts: string[] = [];
  const nextHtml = h.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
    const c = String(css || "").trim();
    if (c) cssParts.push(c);
    return "";
  });

  return { html: nextHtml.trim(), css: cssParts.join("\n\n").trim() };
}

function coerceHtmlFragment(html: string): { html: string; cssFromHtml: string } {
  const raw = String(html || "").trim();
  if (!raw) return { html: "", cssFromHtml: "" };

  const { html: withoutStyles, css } = extractInlineStyleTags(raw);
  const h = withoutStyles.trim();

  if (!/(<!doctype\b|<html\b|<head\b|<body\b)/i.test(h)) {
    return { html: h, cssFromHtml: css };
  }

  const bodyMatch = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const inner = (bodyMatch?.[1] ?? h)
    .replace(/^\s*<!doctype[^>]*>\s*/i, "")
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim();

  return { html: inner, cssFromHtml: css };
}

function hasPlaceholderOrPortalLinks(html: string, css: string) {
  const blob = `${String(html || "")}\n${String(css || "")}`;
  const lower = blob.toLowerCase();
  if (!lower.trim()) return false;

  // Common placeholder patterns the model should never emit.
  if (/\byour_[a-z0-9_\-]+_here\b/i.test(blob)) return true;
  if (/\byour_[a-z0-9_\-]+_link_here\b/i.test(blob)) return true;
  if (lower.includes("your_calendar_embed_link_here")) return true;
  if (lower.includes("your_chatbot_link_here")) return true;

  // Internal portal routes do not exist on public funnels.
  if (lower.includes("/portal/")) return true;

  return false;
}

function inferForcedActionsFromIntent(opts: {
  prompt: string;
  html: string;
  forms: Array<{ slug: string; name: string; status: string }>;
  calendars: Array<{ id: string; enabled: boolean; title: string }>;
  hasStripeProducts: boolean;
}) {
  const prompt = String(opts.prompt || "");
  const html = String(opts.html || "");
  const haystack = `${prompt}\n${html}`.toLowerCase();

  const wantsCalendar =
    /\b(calendar|booking|book\b|schedule|appointment|appoint)\b/i.test(haystack) ||
    haystack.includes("your_calendar_embed_link_here");
  const wantsForm =
    /\b(form|application|apply\b|intake|questionnaire|survey)\b/i.test(haystack) ||
    haystack.includes("/forms/") ||
    haystack.includes("/portal/forms/");
  const wantsChatbot = /\b(chatbot|chat widget|live chat|ai chat)\b/i.test(haystack) || haystack.includes("your_chatbot_link_here");

  // Only force shop preset when the user is clearly asking for a commerce integration.
  const wantsShop =
    /\b(add to cart|cart\b|checkout\b|buy now|purchase\b|stripe\b|shop\b|store\b)\b/i.test(haystack) &&
    (opts.hasStripeProducts || /\b(stripe|checkout|add to cart|cart)\b/i.test(haystack));

  const actions: Array<any> = [];

  if (wantsShop) {
    actions.push({ type: "insertPresetAfter", preset: "shop" });
  }

  if (wantsForm) {
    const formSlug = pickDefaultFormSlug(opts.forms);
    if (formSlug) actions.push({ type: "insertAfter", block: { type: "formEmbed", props: { formSlug, height: 720 } } });
  }

  if (wantsCalendar) {
    const calendarId = pickDefaultCalendarId(opts.calendars);
    if (calendarId)
      actions.push({ type: "insertAfter", block: { type: "calendarEmbed", props: { calendarId, height: 780 } } });
  }

  if (wantsChatbot) {
    actions.push({ type: "insertAfter", block: { type: "chatbot", props: {} } });
  }

  return actions.length ? actions.slice(0, 6) : null;
}

function toAbsoluteUrl(req: Request, url: string): string {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = new URL(req.url).origin;
  return new URL(u, origin).toString();
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

type StripePrice = {
  id: string;
  unit_amount: number | null;
  currency: string;
  type?: string;
  recurring?: unknown;
};

type StripeProduct = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  active: boolean;
  default_price?: StripePrice | string | null;
};

type StripeList<T> = { data: T[] };

async function getStripeProductsForOwner(ownerId: string) {
  const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
  if (!secretKey) {
    return {
      ok: false as const,
      products: [] as Array<{ id: string; name: string; description: string | null; images: string[]; defaultPriceId: string; unitAmount: number | null; currency: string }>,
    };
  }

  const list = await stripeGetWithKey<StripeList<StripeProduct>>(secretKey, "/v1/products", {
    limit: 100,
    active: true,
    "expand[]": ["data.default_price"],
  }).catch(() => null);

  const products = Array.isArray(list?.data)
    ? list!.data
        .filter((p) => p && typeof p === "object" && (p as any).active)
        .map((p) => {
          const dp = p.default_price && typeof p.default_price === "object" ? (p.default_price as StripePrice) : null;
          return {
            id: String(p.id || "").trim(),
            name: String(p.name || "").trim(),
            description: p.description ? String(p.description) : null,
            images: Array.isArray(p.images) ? p.images.map((s) => String(s)).filter(Boolean).slice(0, 4) : [],
            defaultPriceId: dp?.id ? String(dp.id).trim() : "",
            unitAmount: typeof dp?.unit_amount === "number" ? dp.unit_amount : null,
            currency: String(dp?.currency || "usd").toLowerCase() || "usd",
          };
        })
        .filter((p) => p.id && p.name)
    : [];

  return { ok: true as const, products };
}

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  // IMPORTANT: This route is called from inside the portal editor, but the
  // generated output must work on hosted/public funnels (NOT under /portal).
  const hostedBasePath = auth.variant === "credit" ? "/credit" : "";

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { funnelId, pageId, prompt, contextKeys, contextMedia } = parsed.data;
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
  const stripeProducts = await getStripeProductsForOwner(ownerId).catch(() => ({ ok: false as const, products: [] as any[] }));

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

  const contextMediaBlock = contextMedia.length
    ? [
        "",
        "SELECTED_MEDIA (use these assets if relevant):",
        ...contextMedia.map((m) => {
          const name = m.fileName ? ` ${m.fileName}` : "";
          const mime = m.mimeType ? ` (${m.mimeType})` : "";
          return `- ${name}${mime}: ${toAbsoluteUrl(req, m.url)}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const stripeProductsBlock = stripeProducts.ok && stripeProducts.products.length
    ? [
        "",
        "STRIPE_PRODUCTS (already connected; do not ask what they sell):",
        ...stripeProducts.products.slice(0, 60).map((p: any) => {
          const price = p.defaultPriceId ? ` default_price=${p.defaultPriceId}` : "";
          const amt = typeof p.unitAmount === "number" ? ` ${p.unitAmount} ${p.currency}` : "";
          return `- ${p.name} (product=${p.id}${price}${amt})`;
        }),
        "",
      ].join("\n")
    : "\n\nSTRIPE_PRODUCTS: (none found or Stripe not connected)\n";

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
    "- Do NOT output placeholder URLs (e.g. 'your_calendar_embed_link_here'). If you don't have a real URL, ask a question or return JSON actions.",
    "- Do NOT link to /portal/* routes. Those do not exist on hosted funnels.",
    "- Links should be relative and keep the user on the hosted funnel site.",
    "Integration:",
    `- This page is hosted at: ${hostedBasePath}/f/${page.funnel.slug}`,
    `- Hosted forms are at: ${hostedBasePath}/forms/{formSlug}`,
    "- For booking/scheduling: prefer returning a calendarEmbed block rather than hardcoding a booking URL.",
    "- If the user asks for a shop/store/product list, prefer insertPresetAfter with preset='shop'.",
    "- If STRIPE_PRODUCTS are provided, assume Stripe is connected and avoid asking 'what do you sell?'.",
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
    "- If user asks for a chatbot/chat widget, prefer output='actions' with a chatbot block.",
    "- If user asks for a shop/store/product list, prefer output='actions' with an insertPresetAfter preset='shop'.",
    "- If user mentions cart/checkout/add-to-cart/Stripe, prefer output='actions' with preset='shop' (do NOT generate a fake shop in HTML).",
    "- For calendarEmbed, props must include { calendar: { pick: 'default'|'byId'|'byTitle', value? }, height?, style? }.",
    "- For formEmbed/formLink, props must include { form: { pick: 'default'|'bySlug'|'byName', value? }, ... }.",
    "- Use pick='default' for 'my calendar'/'my form' when no specific name/slug is provided.",
    "- For other block types, follow the normal props shapes.",
    "- If output='html', set buildPrompt to a concise instruction for the HTML/CSS generator.",
    "- If key info is missing, output='question' and ask ONE question.",
    "- IMPORTANT: If STRIPE_PRODUCTS are present, do NOT ask what they sell. At most ask which products to feature (if needed).",
    "Context:",
    `- Funnel page host path: ${hostedBasePath}/f/${page.funnel.slug}`,
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Available calendars (id: title [enabled]):",
    ...calendars.map((c) => `- ${c.id}: ${c.title} [${c.enabled ? "enabled" : "disabled"}]`),
  ].join("\n");

  const baseUser = [
    businessContext ? businessContext : "",
    stripeProductsBlock,
    `Funnel: ${page.funnel.name} (slug: ${page.funnel.slug})`,
    `Page: ${page.title} (slug: ${page.slug})`,
    "",
    contextBlock,
    contextMediaBlock,
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

  const imageUrls = Array.from(
    new Set(
      contextMedia
        .map((m) => toAbsoluteUrl(req, String(m?.url || "").trim()))
        .filter(Boolean)
        .slice(0, 8),
    ),
  ).slice(0, 6);

  let buildRaw = "";
  try {
    buildRaw = imageUrls.length
      ? await generateTextWithImages({ system: buildSystem, user: buildUser, imageUrls })
      : await generateText({ system: buildSystem, user: buildUser });
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

  const rawHtmlFence = extractFence(buildRaw, "html");
  const rawCssFence = extractFence(buildRaw, "css");
  const coerced = coerceHtmlFragment(rawHtmlFence);
  const html = coerced.html;
  const css = [rawCssFence, coerced.cssFromHtml].filter(Boolean).join("\n\n").trim();

  if (!html.trim()) {
    return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });
  }

  // Final guardrail: if the model emitted placeholders or portal-only URLs, or if intent is clearly
  // better represented as blocks, force actions instead of returning broken HTML.
  const intentHaystack = `${prompt}\n${html}\n${css}`;
  const shouldForceActions =
    hasPlaceholderOrPortalLinks(html, css) ||
    /\b(chatbot|calendar|booking|schedule|form|cart|checkout|add to cart|stripe|shop|store)\b/i.test(intentHaystack);

  if (shouldForceActions) {
    const forced = inferForcedActionsFromIntent({
      prompt,
      html,
      forms,
      calendars,
      hasStripeProducts: Boolean(stripeProducts.ok && stripeProducts.products.length),
    });

    if (forced?.length) {
      const validated = aiActionsPayloadSchema.safeParse({ actions: forced });
      if (validated.success) {
        let assistantText = "";
        try {
          assistantText = String(
            await generateText({
              system:
                "You are an assistant in a funnel builder. Confirm you can insert proper Funnel Builder blocks instead of custom HTML, and briefly explain what you are about to insert. Keep it to 1-3 short sentences.",
              user: `Planned insert actions (JSON):\n${JSON.stringify({ actions: validated.data.actions }, null, 2)}`,
            }),
          ).trim();
        } catch {
          assistantText = "";
        }

        return NextResponse.json({ ok: true, actions: validated.data.actions, assistantText: assistantText || null });
      }
    }

    try {
      const question = String(
        await generateText({
          system:
            "You are an assistant in a funnel builder. The user asked for custom HTML/CSS, but the best path is to insert a proper Funnel Builder block instead. Ask one concise question to choose the block type. Offer these options: Form, Calendar, Chatbot, Shop. Keep it to 1-2 sentences.",
          user: `Context (JSON):\n${JSON.stringify({ prompt }, null, 2)}`,
        }),
      ).trim();
      return NextResponse.json({ ok: true, question: question.slice(0, 800) });
    } catch {
      return NextResponse.json({ ok: false, error: "AI provider not configured" }, { status: 502 });
    }
  }

  let assistantText = "";
  try {
    assistantText = String(
      await generateText({
        system:
          "You are an assistant in a funnel builder. The custom code block HTML/CSS was just generated/updated. Write a short, friendly confirmation message that invites the user to preview the block and tell you what to tweak next. Keep it to 1-3 sentences and do not invent details.",
        user: `Context (JSON):\n${JSON.stringify({ prompt, hasHtml: Boolean(html), hasCss: Boolean(css) }, null, 2)}`,
      }),
    ).trim();
  } catch {
    assistantText = "";
  }

  return NextResponse.json({ ok: true, html, css, assistantText: assistantText || null });
}
