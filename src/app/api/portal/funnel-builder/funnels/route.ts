import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { buildCreditFunnelPagesFromTemplateAndTheme, coerceCreditFunnelTemplateKey, getCreditFunnelTemplate } from "@/lib/creditFunnelTemplates";
import { coerceCreditFunnelThemeKey, getCreditFunnelTheme } from "@/lib/creditFunnelThemes";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeDomain(raw: unknown) {
  let s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;

  // Strip protocol and any path/query.
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0] || "";
  s = s.split("?")[0] || "";
  s = s.split("#")[0] || "";

  if (!s) return null;
  if (s.length > 253) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  if (s.includes("..")) return null;
  if (s.startsWith("-") || s.endsWith("-")) return null;
  return s;
}

function readFunnelDomains(settingsJson: unknown): Record<string, string> {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return {};
  const raw = (settingsJson as any).funnelDomains;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as any)) {
    if (typeof k !== "string" || !k.trim()) continue;
    const domain = normalizeDomain(v);
    if (!domain) continue;
    out[k] = domain;
  }
  return out;
}

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

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);
  const funnelDomains = readFunnelDomains(settings?.dataJson ?? null);

  const funnels = await prisma.creditFunnel.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  const funnelsWithDomains = funnels.map((f) => ({ ...f, assignedDomain: funnelDomains[f.id] ?? null }));

  return NextResponse.json({ ok: true, funnels: funnelsWithDomains });
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

  const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.funnelCreate);
  if (!charged.ok) {
    return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const slug = normalizeSlug(body?.slug);
  const nameRaw = typeof body?.name === "string" ? body.name.trim() : "";
  const name = nameRaw || (slug ? slug.replace(/-/g, " ") : "");

  const templateKey = coerceCreditFunnelTemplateKey(body?.templateKey);
  const template = templateKey ? getCreditFunnelTemplate(templateKey) : null;
  const requestedThemeKey = coerceCreditFunnelThemeKey(body?.themeKey);
  const themeKey = template ? requestedThemeKey || template.defaultThemeKey : null;
  const theme = themeKey ? getCreditFunnelTheme(themeKey) : null;

  const pageTemplates = template && theme ? buildCreditFunnelPagesFromTemplateAndTheme(template, theme) : null;
  const pagesCreate:
    | Array<{
        slug: string;
        title: string;
        sortOrder: number;
        editorMode: "BLOCKS";
        contentMarkdown: string;
        blocksJson: Prisma.InputJsonValue;
        customHtml: string;
        customChatJson: Prisma.InputJsonValue | null;
      }>
    | null = pageTemplates
    ? pageTemplates.map((p) => ({
        slug: p.slug,
        title: p.title,
        sortOrder: p.sortOrder,
        editorMode: p.editorMode,
        contentMarkdown: p.contentMarkdown,
        blocksJson: p.blocksJson as unknown as Prisma.InputJsonValue,
        customHtml: p.customHtml,
        customChatJson: (p.customChatJson ?? null) as unknown as Prisma.InputJsonValue | null,
      }))
    : null;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  }

  if (!name || name.length > 120) {
    return NextResponse.json({ ok: false, error: "Invalid name" }, { status: 400 });
  }

  let funnel: any = null;
  let candidate = slug;
  for (let i = 0; i < 8; i += 1) {
    funnel = await prisma.creditFunnel
      .create({
        data: {
          ownerId,
          slug: candidate,
          name,
          ...(pagesCreate?.length ? { pages: { create: pagesCreate } } : {}),
        },
        select: { id: true, slug: true, name: true, status: true, createdAt: true, updatedAt: true },
      })
      .catch((e) => {
        const msg = String((e as any)?.message || "");
        if (msg.includes("CreditFunnel_slug_key") || msg.toLowerCase().includes("unique")) return null;
        throw e;
      });

    if (funnel) break;
    candidate = withRandomSuffix(slug);
  }

  if (!funnel) return NextResponse.json({ ok: false, error: "Unable to create funnel" }, { status: 500 });

  return NextResponse.json({ ok: true, funnel });
}
