import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripePostWithKey } from "@/lib/stripeFetchWithKey.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  pageId: z.string().trim().min(1).max(64),
  priceId: z.string().trim().min(1).max(128),
  quantity: z.number().int().min(1).max(20).optional(),
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

export async function POST(req: Request) {
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
  if (!allowed.has(parsed.data.priceId)) {
    return NextResponse.json({ ok: false, error: "This product is not enabled on this page" }, { status: 400 });
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

  const quantity = parsed.data.quantity ?? 1;

  const session = await stripePostWithKey<StripeCheckoutSession>(secretKey, "/v1/checkout/sessions", {
    mode: "payment",
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    "line_items[0][price]": parsed.data.priceId,
    "line_items[0][quantity]": quantity,
    client_reference_id: page.id,
    "metadata[funnel_page_id]": page.id,
    "metadata[funnel_id]": page.funnelId,
    "metadata[source]": "credit_funnel",
  });

  const url = session?.url ? String(session.url) : "";
  if (!url) {
    return NextResponse.json({ ok: false, error: "Stripe did not return a checkout URL" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, url });
}
