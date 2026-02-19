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

export async function GET() {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const forms = await prisma.creditForm.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, forms });
}

export async function POST(req: Request) {
  const auth = await requireCreditClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as any;
  const slug = normalizeSlug(body?.slug);
  const nameRaw = typeof body?.name === "string" ? body.name.trim() : "";
  const name = nameRaw || (slug ? slug.replace(/-/g, " ") : "");

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  }

  if (!name || name.length > 120) {
    return NextResponse.json({ ok: false, error: "Invalid name" }, { status: 400 });
  }

  const form = await prisma.creditForm
    .create({
      data: { ownerId, slug, name },
      select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
    })
    .catch((e) => {
      const msg = String((e as any)?.message || "");
      if (msg.includes("CreditForm_slug_key") || msg.toLowerCase().includes("unique")) return null;
      throw e;
    });

  if (!form) {
    return NextResponse.json({ ok: false, error: "That slug is already taken" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, form });
}
