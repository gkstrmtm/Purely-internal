import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { generateText, generateTextWithImages } from "@/lib/ai";
import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";
import { blocksToCustomHtmlDocument, escapeHtml } from "@/lib/funnelBlocksToCustomHtmlDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampText(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\n<!-- truncated -->";
}

function extractHtml(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/```html\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const anyFence = text.match(/```\s*([\s\S]*?)\s*```/);
  if (anyFence?.[1]) return anyFence[1].trim();

  return text;
}

function extractJson(raw: string): unknown {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : "";
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function extractAiQuestion(raw: string): string | null {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const q = typeof (parsed as any).question === "string" ? String((parsed as any).question).trim() : "";
  if (!q) return null;
  return q.slice(0, 800);
}

function normalizePortalHostedPaths(html: string): string {
  let out = String(html || "");
  if (!out) return out;

  // Public funnels/forms/booking should never be under /portal on hosted pages.
  out = out
    .replace(/\b\/portal\/forms\//gi, "/forms/")
    .replace(/\b\/portal\/f\//gi, "/f/")
    .replace(/\b\/portal\/book\//gi, "/book/")
    .replace(/\b\/api\/public\/portal\//gi, "/api/public/");

  return out;
}

function newBlockId(prefix = "b"): string {
  const g: any = globalThis as any;
  const uuid = typeof g.crypto?.randomUUID === "function" ? String(g.crypto.randomUUID()) : "";
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function detectInteractiveIntent(text: string): {
  wantsShop: boolean;
  wantsCart: boolean;
  wantsCheckout: boolean;
  wantsCalendar: boolean;
  wantsChatbot: boolean;
  any: boolean;
} {
  const s = String(text || "").toLowerCase();
  const wantsShop = /\b(shop|store|product|products|pricing|buy now|buy\b)/.test(s);
  const wantsCart = /\b(cart|add to cart)\b/.test(s);
  const wantsCheckout = /\b(checkout|purchase|pay now)\b/.test(s);
  const wantsCalendar = /\b(calendar|schedule|booking|book a call|book a meeting|appointment)\b/.test(s);
  const wantsChatbot = /\b(chatbot|chat bot|live chat|website chat)\b/.test(s);
  const any = wantsShop || wantsCart || wantsCheckout || wantsCalendar || wantsChatbot;
  return { wantsShop, wantsCart, wantsCheckout, wantsCalendar, wantsChatbot, any };
}

function normalizeAgentId(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  const cleaned = s.slice(0, 120);
  if (!cleaned.startsWith("agent_")) return "";
  return cleaned;
}

async function getOwnerChatAgentIds(ownerId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    const clean = normalizeAgentId(id);
    if (!clean) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  const receptionist = await getAiReceptionistServiceData(ownerId).catch(() => null);
  if (receptionist) {
    push(receptionist.settings.chatAgentId);
  }

  const campaigns = await prisma.portalAiOutboundCallCampaign
    .findMany({
      where: { ownerId },
      select: { chatAgentId: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    })
    .catch(() => [] as Array<{ chatAgentId: string | null }>);

  for (const c of campaigns) {
    if (c?.chatAgentId) push(c.chatAgentId);
  }

  return out.slice(0, 50);
}

function buildInteractiveBlocks(opts: {
  funnelName: string;
  pageTitle: string;
  ownerId: string;
  stripeProducts: Array<{
    id: string;
    name: string;
    description: string | null;
    images: string[];
    defaultPriceId: string;
    unitAmount: number | null;
    currency: string;
  }>;
  calendarId?: string;
  chatAgentId?: string;
  intent: ReturnType<typeof detectInteractiveIntent>;
}): CreditFunnelBlock[] {
  const blocks: CreditFunnelBlock[] = [];

  blocks.push({ id: newBlockId("page"), type: "page", props: {} });

  blocks.push({
    id: newBlockId("header"),
    type: "headerNav",
    props: {
      sticky: true,
      transparent: false,
      items: [],
    },
  });

  blocks.push({
    id: newBlockId("hero"),
    type: "section",
    props: {
      children: [
        {
          id: newBlockId("h1"),
          type: "heading",
          props: { text: opts.pageTitle || opts.funnelName || "Welcome", level: 1 },
        },
        {
          id: newBlockId("p"),
          type: "paragraph",
          props: {
            text:
              "Explore what we offer below. Add items to your cart, checkout securely, or book a time to talk. You can do it all on this page.",
          },
        },
        {
          id: newBlockId("cart"),
          type: "cartButton",
          props: { text: "Cart" },
        },
      ],
    },
  });

  if (opts.intent.wantsShop || opts.intent.wantsCart || opts.intent.wantsCheckout) {
    const purchasable = opts.stripeProducts
      .filter((p) => p && p.defaultPriceId)
      .slice(0, 6);

    if (purchasable.length) {
      blocks.push({
        id: newBlockId("shopSection"),
        type: "section",
        props: {
          children: [
            {
              id: newBlockId("shopH"),
              type: "heading",
              props: { text: "Shop", level: 2 },
            },
            {
              id: newBlockId("shopCols"),
              type: "columns",
              props: {
                gapPx: 18,
                stackOnMobile: true,
                columns: purchasable.slice(0, 3).map((p) => {
                  const children: CreditFunnelBlock[] = [];
                  const img = p.images?.[0] ? String(p.images[0]).trim() : "";
                  if (img) {
                    children.push({
                      id: newBlockId("img"),
                      type: "image",
                      props: { src: img, alt: p.name || "Product" },
                    });
                  }

                  children.push({
                    id: newBlockId("name"),
                    type: "heading",
                    props: { text: p.name, level: 3 },
                  });

                  if (p.description) {
                    children.push({
                      id: newBlockId("desc"),
                      type: "paragraph",
                      props: { text: String(p.description).slice(0, 320) },
                    });
                  }

                  children.push({
                    id: newBlockId("add"),
                    type: "addToCartButton",
                    props: {
                      priceId: p.defaultPriceId,
                      quantity: 1,
                      productName: p.name,
                      ...(p.description ? { productDescription: String(p.description).slice(0, 320) } : {}),
                      text: "Add to cart",
                    },
                  });

                  children.push({
                    id: newBlockId("buy"),
                    type: "salesCheckoutButton",
                    props: {
                      priceId: p.defaultPriceId,
                      quantity: 1,
                      productName: p.name,
                      ...(p.description ? { productDescription: String(p.description).slice(0, 320) } : {}),
                      text: "Buy now",
                    },
                  });

                  return { markdown: "", children };
                }),
              },
            },
          ],
        },
      });
    }
  }

  if (opts.intent.wantsCalendar && opts.calendarId) {
    blocks.push({
      id: newBlockId("calSection"),
      type: "section",
      props: {
        children: [
          { id: newBlockId("calH"), type: "heading", props: { text: "Book a time", level: 2 } },
          {
            id: newBlockId("calEmbed"),
            type: "calendarEmbed",
            props: { calendarId: opts.calendarId, height: 760 },
          },
        ],
      },
    });
  }

  if (opts.intent.wantsChatbot && opts.chatAgentId) {
    blocks.push({
      id: newBlockId("chatbot"),
      type: "chatbot",
      props: {
        agentId: opts.chatAgentId,
        launcherStyle: "bubble",
        placementX: "right",
        placementY: "bottom",
      },
    });
  }

  return blocks;
}

async function generatePageUpdatedAssistantText(opts: { pageTitle?: string; funnelName?: string }) {
  const payload = {
    pageTitle: String(opts.pageTitle || "").trim().slice(0, 160) || null,
    funnelName: String(opts.funnelName || "").trim().slice(0, 160) || null,
  };

  const system =
    "You are an assistant inside a funnel builder. The page has just been updated. Write a short, friendly confirmation message that invites the user to preview the page and tell you what to tweak next. Do not claim you can see their preview. Keep it to 1-3 sentences.";

  try {
    return String(await generateText({ system, user: `Context (JSON):\n${JSON.stringify(payload, null, 2)}` })).trim();
  } catch {
    return "";
  }
}

type AiAttachment = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

type ContextMedia = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

function coerceAttachments(raw: unknown): AiAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AiAttachment[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const url = typeof (it as any).url === "string" ? (it as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (it as any).fileName === "string" ? (it as any).fileName.trim() : undefined;
    const mimeType = typeof (it as any).mimeType === "string" ? (it as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 12) break;
  }
  return out;
}

function coerceContextMedia(raw: unknown): ContextMedia[] {
  if (!Array.isArray(raw)) return [];
  const out: ContextMedia[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const url = typeof (it as any).url === "string" ? (it as any).url.trim() : "";
    if (!url) continue;
    const fileName = typeof (it as any).fileName === "string" ? (it as any).fileName.trim() : undefined;
    const mimeType = typeof (it as any).mimeType === "string" ? (it as any).mimeType.trim() : undefined;
    out.push({ url, fileName, mimeType });
    if (out.length >= 24) break;
  }
  return out;
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
  if (!secretKey) return { ok: false as const, products: [] as Array<{ id: string; name: string; description: string | null; images: string[]; defaultPriceId: string; unitAmount: number | null; currency: string }> };

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

function toAbsoluteUrl(req: Request, url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  const origin = new URL(req.url).origin;
  return new URL(u, origin).toString();
}

function coerceContextKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    out.push(s.slice(0, 80));
    if (out.length >= 30) break;
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ funnelId: string; pageId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const basePath = auth.variant === "credit" ? "/credit" : "";

  const { funnelId: funnelIdRaw, pageId: pageIdRaw } = await ctx.params;
  const funnelId = String(funnelIdRaw || "").trim();
  const pageId = String(pageIdRaw || "").trim();
  if (!funnelId || !pageId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ ok: false, error: "Prompt is required" }, { status: 400 });

  const currentHtmlFromClient = typeof body?.currentHtml === "string" ? body.currentHtml : null;
  const attachments = coerceAttachments(body?.attachments);
  const contextKeys = coerceContextKeys(body?.contextKeys);
  const contextMedia = coerceContextMedia(body?.contextMedia);

  const page = await prisma.creditFunnelPage.findFirst({
    where: { id: pageId, funnelId, funnel: { ownerId: auth.session.user.id } },
    select: {
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      blocksJson: true,
      customChatJson: true,
      customHtml: true,
      funnel: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const ownerId = auth.session.user.id;
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const stripeProducts = await getStripeProductsForOwner(ownerId).catch(() => ({ ok: false as const, products: [] as any[] }));

  const intent = detectInteractiveIntent(prompt);
  if (intent.any) {
    const bookingCalendars = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1 as const, calendars: [] as any[] }));
    const enabledCalendars = Array.isArray((bookingCalendars as any).calendars)
      ? (bookingCalendars as any).calendars.filter((c: any) => c && typeof c === "object" && (c as any).enabled !== false)
      : [];
    const calendarId = enabledCalendars[0]?.id ? String(enabledCalendars[0].id).trim().slice(0, 50) : "";

    const agentIds = await getOwnerChatAgentIds(ownerId).catch(() => [] as string[]);
    const chatAgentId = agentIds[0] ? String(agentIds[0]).trim() : "";

    const purchasable = stripeProducts.ok
      ? (stripeProducts.products as any[]).filter((p) => p && typeof p === "object" && String((p as any).defaultPriceId || "").trim())
      : [];

    const missingShop = (intent.wantsShop || intent.wantsCart || intent.wantsCheckout) && purchasable.length === 0;
    const missingCalendar = intent.wantsCalendar && !calendarId;
    const missingChatbot = intent.wantsChatbot && !chatAgentId;

    if (missingShop || missingCalendar || missingChatbot) {
      const parts: string[] = [];
      if (missingShop) parts.push("I can add a working Shop/Cart/Checkout, but I don't see any Stripe products with default prices yet. Do you want to connect Stripe and add products first?");
      if (missingCalendar) parts.push("I can embed a working booking calendar, but you don't have any booking calendars configured yet. Which calendar should I use (or should I create one in Booking settings first)?");
      if (missingChatbot) parts.push("I can add a working chatbot widget, but I don't see an ElevenLabs chat agent ID for this account yet. What agent ID should I use?");
      const question = parts[0] ? parts[0].slice(0, 800) : "Which interactive block should I add (shop, calendar, or chatbot)?";

      const prevChat = Array.isArray(page.customChatJson) ? (page.customChatJson as any[]) : [];
      const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };
      const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
      const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

      const updated = await prisma.creditFunnelPage.update({
        where: { id: page.id },
        data: {
          customChatJson: nextChat,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          editorMode: true,
          blocksJson: true,
          customHtml: true,
          customChatJson: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({ ok: true, question, page: updated });
    }

    const blocks = buildInteractiveBlocks({
      funnelName: page.funnel.name,
      pageTitle: page.title,
      ownerId,
      stripeProducts: stripeProducts.ok ? (stripeProducts.products as any) : [],
      ...(calendarId ? { calendarId } : {}),
      ...(chatAgentId ? { chatAgentId } : {}),
      intent,
    });

    const prevChat = Array.isArray(page.customChatJson) ? (page.customChatJson as any[]) : [];
    const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };
    const assistantMsg = {
      role: "assistant",
      content:
        "Done. I inserted real Funnel Builder blocks for the interactive parts (shop/cart/checkout/calendar/chatbot) so everything works in preview and on the hosted page. I also generated a full Custom code HTML snapshot of the page so you can switch to Custom code and keep the preview.",
      at: new Date().toISOString(),
    };
    const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

    const htmlSnapshot = blocksToCustomHtmlDocument({
      blocks,
      pageId: page.id,
      ownerId,
      basePath,
      title: page.title || page.funnel.name || "Funnel page",
    });

    const updated = await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: {
        editorMode: "BLOCKS",
        blocksJson: blocks as any,
        customHtml: htmlSnapshot,
        customChatJson: nextChat,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        blocksJson: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, page: updated });
  }

  const forms = await prisma.creditForm.findMany({
    where: { ownerId: auth.session.user.id },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: { slug: true, name: true, status: true },
  });

  const baseSystem = [
    "You generate a single self-contained HTML document for a marketing funnel page for the user's business.",
    "If the request is ambiguous or missing key details, ask ONE concise follow-up question instead of guessing.",
    "Return EITHER:",
    "- A single ```html fenced block containing the full HTML document, OR",
    "- A single ```json fenced block: { \"question\": \"...\" }",
    "Do NOT output anything else.",
    "Constraints:",
    "- Use plain HTML + inline <style>. No external JS/CSS, no frameworks.",
    "- Mobile-first, modern, clean styling.",
    "- Use relative links (no /portal/* links).",
    "Integration:",
    `- This page will be hosted at: ${basePath}/f/${page.funnel.slug}`,
    `- Hosted forms are at: ${basePath}/forms/{formSlug}`,
    `- Form submissions happen via POST /api/public${basePath}/forms/{formSlug}/submit (handled by our hosted form pages)`,
    `- If you need a form, link to ${basePath}/forms/{formSlug} with a clear CTA button.`,
    "Rules:",
    "- Do not invent form slugs. Only reference a form if the user explicitly asks to embed/link a form, or if they clearly asked for a lead-capture form.",
    "- If the user asks for a shop/store, use STRIPE_PRODUCTS if available.",
    "- If STRIPE_PRODUCTS is present, do NOT ask what products they sell.",
    "- If STRIPE_PRODUCTS is empty and the user asks for a shop/store, ask ONE question: whether they want to connect Stripe or describe their products.",
    "Available forms (slug: name [status]):",
    ...forms.map((f) => `- ${f.slug}: ${f.name} [${f.status}]`),
    "Output rules:",
    "- Include <meta name=\"viewport\"> and a <title>.",
    "- Avoid placeholder braces like {{var}} unless asked.",
  ];

  const effectiveCurrentHtml =
    (currentHtmlFromClient && currentHtmlFromClient.trim() ? currentHtmlFromClient : page.customHtml || "").trim();
  const hasCurrentHtml = Boolean(effectiveCurrentHtml);

  const system = [
    ...baseSystem,
    hasCurrentHtml
      ? "Editing mode: You will be given CURRENT_HTML. Apply the user's instruction as a minimal change to CURRENT_HTML. Return the FULL updated HTML document."
      : "Generation mode: Create a new HTML document from the user's instruction.",
  ].join("\n");

  const prevChat = Array.isArray(page.customChatJson) ? (page.customChatJson as any[]) : [];
  const attachmentsBlock = attachments.length
    ? [
        "",
        "ATTACHMENTS:",
        ...attachments.map((a) => {
          const name = a.fileName ? ` ${a.fileName}` : "";
          const mime = a.mimeType ? ` (${a.mimeType})` : "";
          const url = toAbsoluteUrl(req, a.url);
          return `- ${name}${mime}: ${url}`.trim();
        }),
        "",
      ].join("\n")
    : "";

  const contextBlock = contextKeys.length
    ? [
        "",
        "SELECTED_CONTEXT (use these elements if relevant):",
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
          const url = toAbsoluteUrl(req, m.url);
          return `- ${name}${mime}: ${url}`.trim();
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

  const userMsg = { role: "user", content: `${prompt}`, at: new Date().toISOString() };

  let html = "";
  let question: string | null = null;
  try {
    const currentHtmlBlock = hasCurrentHtml
      ? [
          "CURRENT_HTML:",
          "```html",
          clampText(effectiveCurrentHtml, 24000),
          "```",
          "",
        ].join("\n")
      : "";

    const imageUrls = [
      ...attachments
        .filter((a) => String(a.mimeType || "").toLowerCase().startsWith("image/"))
        .map((a) => toAbsoluteUrl(req, a.url)),
      ...contextMedia
        .filter((m) => String(m.mimeType || "").toLowerCase().startsWith("image/"))
        .map((m) => toAbsoluteUrl(req, m.url)),
    ]
      .filter(Boolean)
      .slice(0, 8);

    const userText = [
      businessContext ? businessContext : "",
      stripeProductsBlock,
      `Funnel: ${page.funnel.name} (slug: ${page.funnel.slug})`,
      `Page: ${page.title} (slug: ${page.slug})`,
      "",
      currentHtmlBlock,
      prompt,
      contextBlock,
      contextMediaBlock,
      attachmentsBlock,
    ].join("\n");

    const aiRaw = imageUrls.length
      ? await generateTextWithImages({ system, user: userText, imageUrls })
      : await generateText({ system, user: userText });

    question = extractAiQuestion(aiRaw);
    if (!question) {
      html = extractHtml(aiRaw);
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as any)?.message ? String((e as any).message) : "AI generation failed" },
      { status: 500 },
    );
  }

  if (question) {
    const assistantMsg = { role: "assistant", content: question, at: new Date().toISOString() };
    const nextChat = [...prevChat, userMsg, assistantMsg].slice(-40);

    const updated = await prisma.creditFunnelPage.update({
      where: { id: page.id },
      data: {
        editorMode: "CUSTOM_HTML",
        customChatJson: nextChat,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        editorMode: true,
        customHtml: true,
        customChatJson: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, question, page: updated });
  }

  if (!html) return NextResponse.json({ ok: false, error: "AI returned empty HTML" }, { status: 502 });

  html = normalizePortalHostedPaths(html);

  if (!/<!doctype\s+html|<html\b/i.test(html)) {
    html = [
      "<!doctype html>",
      "<html>",
      "<head>",
      "  <meta charset=\"utf-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "  <title>AI Output</title>",
      "  <style>body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; padding:24px} pre{white-space:pre-wrap; word-break:break-word}</style>",
      "</head>",
      "<body>",
      `  <pre>${escapeHtml(html)}</pre>`,
      "</body>",
      "</html>",
    ].join("\n");
  }

  const pageUpdatedText = await generatePageUpdatedAssistantText({ pageTitle: page.title, funnelName: page.funnel?.name });
  const assistantMsg = pageUpdatedText.trim()
    ? {
        role: "assistant" as const,
        content: pageUpdatedText.trim(),
        at: new Date().toISOString(),
      }
    : null;
  const nextChat = (assistantMsg ? [...prevChat, userMsg, assistantMsg] : [...prevChat, userMsg]).slice(-40);

  const updated = await prisma.creditFunnelPage.update({
    where: { id: page.id },
    data: {
      editorMode: "CUSTOM_HTML",
      customHtml: normalizePortalHostedPaths(html),
      customChatJson: nextChat,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      editorMode: true,
      customHtml: true,
      customChatJson: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, html: updated.customHtml, page: updated });
}
