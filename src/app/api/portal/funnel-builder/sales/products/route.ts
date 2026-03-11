import { NextResponse } from "next/server";
import { z } from "zod";

import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey, stripePostWithKey } from "@/lib/stripeFetchWithKey.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function normalizeStripeProduct(p: StripeProduct) {
  const defaultPriceObj = p.default_price && typeof p.default_price === "object" ? (p.default_price as StripePrice) : null;
  return {
    id: String(p.id || ""),
    name: String(p.name || ""),
    description: p.description ? String(p.description) : null,
    images: Array.isArray(p.images) ? p.images.map((s) => String(s)).filter(Boolean).slice(0, 8) : [],
    active: Boolean(p.active),
    defaultPrice: defaultPriceObj
      ? {
          id: String(defaultPriceObj.id || ""),
          unitAmount: typeof defaultPriceObj.unit_amount === "number" ? defaultPriceObj.unit_amount : null,
          currency: String(defaultPriceObj.currency || "").toLowerCase() || "usd",
        }
      : null,
  };
}

export async function GET() {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
  if (!secretKey) {
    return NextResponse.json({ ok: false, error: "Stripe is not connected" }, { status: 400 });
  }

  const list = await stripeGetWithKey<StripeList<StripeProduct>>(secretKey, "/v1/products", {
    limit: 100,
    active: true,
    "expand[]": ["data.default_price"],
  });

  const products = Array.isArray(list?.data) ? list.data.map(normalizeStripeProduct) : [];
  return NextResponse.json({ ok: true, products });
}

const postSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  imageUrls: z.array(z.string().trim().url().max(500)).max(8).optional(),
  priceCents: z.number().int().min(50).max(100_000_00),
  currency: z.string().trim().min(3).max(10).optional(),
});

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const secretKey = await getStripeSecretKeyForOwner(ownerId).catch(() => null);
  if (!secretKey) {
    return NextResponse.json({ ok: false, error: "Stripe is not connected" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const currency = (parsed.data.currency || "usd").trim().toLowerCase();

  const created = await stripePostWithKey<StripeProduct>(secretKey, "/v1/products", {
    name: parsed.data.name,
    ...(parsed.data.description ? { description: parsed.data.description } : {}),
    ...(parsed.data.imageUrls?.length ? { "images[]": parsed.data.imageUrls } : {}),
    "default_price_data[unit_amount]": parsed.data.priceCents,
    "default_price_data[currency]": currency,
  });

  return NextResponse.json({ ok: true, product: normalizeStripeProduct(created) });
}
