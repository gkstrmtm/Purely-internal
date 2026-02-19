import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeSlug(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const cleaned = s
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "");

  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  return cleaned;
}

export async function GET(_req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId } = await ctx.params;
  const id = String(funnelId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const funnel = await prisma.creditFunnel.findFirst({
    where: { id, ownerId: auth.session.user.id },
    select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  if (!funnel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, funnel });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { funnelId } = await ctx.params;
  const id = String(funnelId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const existing = await prisma.creditFunnel.findFirst({
    where: { id, ownerId: auth.session.user.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as any;
  const data: any = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 120) {
      return NextResponse.json({ ok: false, error: "Invalid name" }, { status: 400 });
    }
    data.name = name;
  }

  if (typeof body?.status === "string") {
    if (body.status !== "DRAFT" && body.status !== "ACTIVE" && body.status !== "ARCHIVED") {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }

  if (typeof body?.slug === "string") {
    const slug = normalizeSlug(body.slug);
    if (!slug) return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
    data.slug = slug;
  }

  const funnel = await prisma.creditFunnel
    .update({
      where: { id },
      data,
      select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
    })
    .catch((e) => {
      const msg = String((e as any)?.message || "");
      if (msg.toLowerCase().includes("unique") || msg.includes("CreditFunnel_slug_key")) return null;
      throw e;
    });

  if (!funnel) return NextResponse.json({ ok: false, error: "That slug is already taken" }, { status: 409 });
  return NextResponse.json({ ok: true, funnel });
}
