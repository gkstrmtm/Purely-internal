import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { parseCreditFunnelTrackingContext, trackCreditFunnelEvent } from "@/lib/funnelEventTracking";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";
import { stripePostWithKey } from "@/lib/stripeFetchWithKey.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    pageId: z.string().trim().min(1).max(64),
    // legacy single-item
    priceId: z.string().trim().min(1).max(128).optional(),
    quantity: z.number().int().min(1).max(20).optional(),
    // cart
    items: z
      .array(
        z.object({
          priceId: z.string().trim().min(1).max(128),
          quantity: z.number().int().min(1).max(20).optional(),
        }),
      )
      .max(25)
      .optional(),
    trackingContext: z.unknown().optional(),
  })
  .superRefine((v, ctx) => {
    const hasItems = Array.isArray(v.items) && v.items.length > 0;
    const hasSingle = typeof v.priceId === "string" && v.priceId.trim().length > 0;
    if (!hasItems && !hasSingle) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing priceId or items" });
    }
  });

function collectAllowedPriceIds(blocks: CreditFunnelBlock[]): Set<string> {
  const out = new Set<string>();

  const walk = (arr: CreditFunnelBlock[]) => {
    for (const b of arr) {
      if (!b || typeof b !== "object") continue;

      if (b.type === "salesCheckoutButton") {
        const priceId = typeof (b.props as any)?.priceId === "string" ? String((b.props as any).priceId).trim() : "";
        if (priceId) out.add(priceId);
        continue;
      }

      if (b.type === "addToCartButton") {
        const priceId = typeof (b.props as any)?.priceId === "string" ? String((b.props as any).priceId).trim() : "";
        if (priceId) out.add(priceId);
        continue;
      }

      if (b.type === "section") {
        const p: any = b.props as any;
        if (Array.isArray(p?.children)) walk(p.children);
        if (Array.isArray(p?.leftChildren)) walk(p.leftChildren);
        if (Array.isArray(p?.rightChildren)) walk(p.rightChildren);
        continue;
      }

      if (b.type === "columns") {
        const cols: any[] = Array.isArray((b.props as any)?.columns) ? ((b.props as any).columns as any[]) : [];
        for (const c of cols) {
          if (c && Array.isArray((c as any).children)) walk((c as any).children);
        }
        continue;
      }
    }
  };

  walk(blocks);
  return out;
}

function returnUrlFromRequest(req: Request): URL {
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.protocol === "http:" || u.protocol === "https:") return u;
    } catch {
      // ignore
    }
  }

  const proto = req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return new URL(`${proto}://${host}/`);
}

type StripeCheckoutSession = { id: string; url: string | null };

type StripePrice = {
  id: string;
  type?: "one_time" | "recurring" | string;
  recurring?: unknown;
};

async function inferCheckoutModeFromPrices(secretKey: string, priceIds: string[]): Promise<"payment" | "subscription"> {
  const uniq = Array.from(new Set(priceIds.map((p) => String(p || "").trim()).filter(Boolean)));
  if (!uniq.length) return "payment";

  const prices = await Promise.all(
    uniq.map((id) => stripeGetWithKey<StripePrice>(secretKey, `/v1/prices/${encodeURIComponent(id)}`)),
  );

  const isRecurring = (p: StripePrice) => p?.type === "recurring" || Boolean(p?.recurring);
  const hasRecurring = prices.some(isRecurring);
  const hasOneTime = prices.some((p) => !isRecurring(p));

  if (hasRecurring && hasOneTime) {
    throw new Error("This cart mixes one-time and subscription items. Please remove one type and try again.");
  }

  return hasRecurring ? "subscription" : "payment";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const page = await prisma.creditFunnelPage
      .findUnique({
        where: { id: parsed.data.pageId },
        select: {
          id: true,
          blocksJson: true,
          funnelId: true,
          funnel: { select: { ownerId: true } },
        },
      })
      .catch(() => null);

    if (!page) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const blocks = coerceBlocksJson(page.blocksJson);
    const allowed = collectAllowedPriceIds(blocks);

    const requestedItemsRaw =
      Array.isArray((parsed.data as any).items) && (parsed.data as any).items.length
        ? ((parsed.data as any).items as Array<{ priceId: string; quantity?: number }>).filter(Boolean)
        : null;

    const requestedItems = requestedItemsRaw
      ? requestedItemsRaw
          .map((it) => ({
            priceId: String(it.priceId || "").trim(),
            quantity: typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.max(1, Math.min(20, it.quantity)) : 1,
          }))
          .filter((it) => it.priceId)
          .slice(0, 25)
      : [
          {
            priceId: String((parsed.data as any).priceId || "").trim(),
            quantity: typeof (parsed.data as any).quantity === "number" ? (parsed.data as any).quantity : 1,
          },
        ].filter((it) => it.priceId);

    if (!requestedItems.length) {
      return NextResponse.json({ ok: false, error: "No items" }, { status: 400 });
    }

    for (const it of requestedItems) {
      if (!allowed.has(it.priceId)) {
        return NextResponse.json({ ok: false, error: "This product is not enabled on this page" }, { status: 400 });
      }
    }

    const ownerId = page.funnel?.ownerId || "";
    if (!ownerId) {
      return NextResponse.json({ ok: false, error: "Invalid funnel" }, { status: 400 });
    }

    const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
    if (!secretKey) {
      return NextResponse.json({ ok: false, error: "Stripe is not connected" }, { status: 400 });
    }

    const baseReturn = returnUrlFromRequest(req);

    const successUrl = new URL(baseReturn.toString());
    successUrl.searchParams.set("checkout", "success");
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

    const cancelUrl = new URL(baseReturn.toString());
    cancelUrl.searchParams.set("checkout", "cancel");

    let mode: "payment" | "subscription" = "payment";
    try {
      mode = await inferCheckoutModeFromPrices(secretKey, requestedItems.map((it) => it.priceId));
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Invalid cart";
      return NextResponse.json({ ok: false, error: msg || "Invalid cart" }, { status: 400 });
    }

    const stripeParams: Record<string, unknown> = {
      mode,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      client_reference_id: page.id,
      "metadata[funnel_page_id]": page.id,
      "metadata[funnel_id]": page.funnelId,
      "metadata[source]": "credit_funnel",
    };

    requestedItems.forEach((it, idx) => {
      stripeParams[`line_items[${idx}][price]`] = it.priceId;
      stripeParams[`line_items[${idx}][quantity]`] = it.quantity;
    });

    const session = await stripePostWithKey<StripeCheckoutSession>(secretKey, "/v1/checkout/sessions", stripeParams);

    const url = session?.url ? String(session.url) : "";
    if (!url) {
      return NextResponse.json({ ok: false, error: "Stripe did not return a checkout URL" }, { status: 502 });
    }

    const trackingContext = parseCreditFunnelTrackingContext(parsed.data.trackingContext);
    await trackCreditFunnelEvent({
      ownerId,
      funnelId: page.funnelId,
      pageId: page.id,
      eventType: "checkout_started",
      eventPath: trackingContext?.path || null,
      source: trackingContext?.source || "checkout_session",
      sessionId: trackingContext?.sessionId || null,
      referrer: trackingContext?.referrer || req.headers.get("referer") || null,
      utmSource: trackingContext?.utmSource || null,
      utmMedium: trackingContext?.utmMedium || null,
      utmCampaign: trackingContext?.utmCampaign || null,
      utmContent: trackingContext?.utmContent || null,
      utmTerm: trackingContext?.utmTerm || null,
      checkoutSessionId: session.id,
      payloadJson: { items: requestedItems },
    });

    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Unable to start checkout";
    return NextResponse.json({ ok: false, error: msg || "Unable to start checkout" }, { status: 500 });
  }
}
