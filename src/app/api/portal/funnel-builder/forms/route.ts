import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { normalizeCreditFormSchema } from "@/lib/creditFormSchema";
import { buildCreditFormSchemaFromTemplateAndTheme, coerceCreditFormTemplateKey, getCreditFormTemplate } from "@/lib/creditFormTemplates";
import { coerceCreditFormThemeKey, getCreditFormTheme } from "@/lib/creditFormThemes";
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

export async function GET() {
  const auth = await requireFunnelBuilderSession();
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
  const auth = await requireFunnelBuilderSession();
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
  const templateKey = coerceCreditFormTemplateKey(body?.templateKey);
  const template = templateKey ? getCreditFormTemplate(templateKey) : null;
  const requestedThemeKey = coerceCreditFormThemeKey(body?.themeKey);
  const themeKey = template ? requestedThemeKey || template.defaultThemeKey : null;
  const theme = themeKey ? getCreditFormTheme(themeKey) : null;

  const schemaJson: Prisma.InputJsonValue | undefined =
    template && theme
      ? (normalizeCreditFormSchema(buildCreditFormSchemaFromTemplateAndTheme(template, theme)) as unknown as Prisma.InputJsonValue)
      : undefined;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  }

  if (!name || name.length > 120) {
    return NextResponse.json({ ok: false, error: "Invalid name" }, { status: 400 });
  }

  let form: any = null;
  let candidate = slug;
  for (let i = 0; i < 8; i += 1) {
    form = await prisma.creditForm
      .create({
        data: { ownerId, slug: candidate, name, ...(schemaJson ? { schemaJson } : {}) },
        select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
      })
      .catch((e) => {
        const msg = String((e as any)?.message || "");
        if (msg.includes("CreditForm_slug_key") || msg.toLowerCase().includes("unique")) return null;
        throw e;
      });

    if (form) break;
    candidate = withRandomSuffix(slug);
  }

  if (!form) return NextResponse.json({ ok: false, error: "Unable to create form" }, { status: 500 });

  return NextResponse.json({ ok: true, form });
}
