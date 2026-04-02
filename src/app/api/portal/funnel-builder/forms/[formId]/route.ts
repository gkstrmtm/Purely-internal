import { NextResponse } from "next/server";

import { normalizeCreditFormSchema } from "@/lib/creditFormSchema";
import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

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

function withRandomSuffix(base: string, maxLen = 60) {
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  const suffix = `-${digits}`;
  const headMax = Math.max(1, maxLen - suffix.length);
  const head = base.length > headMax ? base.slice(0, headMax).replace(/-+$/g, "") : base;
  return `${head}${suffix}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ formId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { formId } = await ctx.params;
  const id = String(formId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const form = await prisma.creditForm.findFirst({
    where: { id, ownerId: auth.session.user.id },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      schemaJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!form) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, form });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ formId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { formId } = await ctx.params;
  const id = String(formId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const existing = await prisma.creditForm.findFirst({ where: { id, ownerId: auth.session.user.id }, select: { id: true } });
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

  if (body?.schemaJson !== undefined) {
    data.schemaJson = normalizeCreditFormSchema(body.schemaJson);
  }

  const desiredSlug = typeof (data as any)?.slug === "string" ? String((data as any).slug) : null;
  let form: any = null;
  let candidate = desiredSlug;
  for (let i = 0; i < 8; i += 1) {
    if (candidate) (data as any).slug = candidate;

    form = await prisma.creditForm
      .update({
        where: { id },
        data,
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          schemaJson: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      .catch((e) => {
        const msg = String((e as any)?.message || "");
        if (msg.toLowerCase().includes("unique") || msg.includes("CreditForm_slug_key")) return null;
        throw e;
      });

    if (form) break;
    if (!desiredSlug) break;
    candidate = withRandomSuffix(desiredSlug);
  }

  if (!form) return NextResponse.json({ ok: false, error: "Unable to update form" }, { status: 500 });
  return NextResponse.json({ ok: true, form });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ formId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { formId } = await ctx.params;
  const id = String(formId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const existing = await prisma.creditForm.findFirst({ where: { id, ownerId: auth.session.user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await prisma.creditForm.delete({ where: { id: existing.id }, select: { id: true } });
  return NextResponse.json({ ok: true });
}
