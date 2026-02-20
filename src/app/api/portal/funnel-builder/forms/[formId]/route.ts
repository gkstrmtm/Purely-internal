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

function normalizeHexColor(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s === "transparent") return "transparent";
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  return s;
}

function normalizeStyle(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as any;
  const out: any = {};

  const pageBg = normalizeHexColor(r.pageBg);
  const cardBg = normalizeHexColor(r.cardBg);
  const buttonBg = normalizeHexColor(r.buttonBg);
  const buttonText = normalizeHexColor(r.buttonText);
  const inputBg = normalizeHexColor(r.inputBg);
  const inputBorder = normalizeHexColor(r.inputBorder);
  const textColor = normalizeHexColor(r.textColor);

  if (pageBg) out.pageBg = pageBg;
  if (cardBg) out.cardBg = cardBg;
  if (buttonBg) out.buttonBg = buttonBg;
  if (buttonText) out.buttonText = buttonText;
  if (inputBg) out.inputBg = inputBg;
  if (inputBorder) out.inputBorder = inputBorder;
  if (textColor) out.textColor = textColor;

  if (typeof r.radiusPx === "number" && Number.isFinite(r.radiusPx)) {
    out.radiusPx = Math.max(0, Math.min(40, Math.round(r.radiusPx)));
  }

  return out;
}

function normalizeSchema(schema: unknown): any {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { fields: [] };
  const fields = (schema as any).fields;
  const style = normalizeStyle((schema as any).style);
  if (!Array.isArray(fields)) return { fields: [] };
  const out: any[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const name = typeof (f as any).name === "string" ? (f as any).name.trim() : "";
    const label = typeof (f as any).label === "string" ? (f as any).label.trim() : "";
    const type = (f as any).type;
    const required = (f as any).required === true;
    if (!name || !label) continue;
    if (type !== "text" && type !== "email" && type !== "tel" && type !== "textarea") continue;
    out.push({ name: name.slice(0, 64), label: label.slice(0, 160), type, required });
  }

  const normalized: any = { fields: out.slice(0, 50) };
  if (style && typeof style === "object" && Object.keys(style).length) normalized.style = style;
  return normalized;
}

export async function GET(_req: Request, ctx: { params: Promise<{ formId: string }> }) {
  const auth = await requireCreditClientSession();
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
  const auth = await requireCreditClientSession();
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
    data.schemaJson = normalizeSchema(body.schemaJson);
  }

  const form = await prisma.creditForm
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

  if (!form) return NextResponse.json({ ok: false, error: "That slug is already taken" }, { status: 409 });
  return NextResponse.json({ ok: true, form });
}
