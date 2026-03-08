import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FunnelSeo = {
  title?: string;
  description?: string;
  imageUrl?: string;
  noIndex?: boolean;
};

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

function writeFunnelDomain(settingsJson: unknown, funnelId: string, domain: string | null) {
  const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
  const funnelDomains =
    base.funnelDomains && typeof base.funnelDomains === "object" && !Array.isArray(base.funnelDomains)
      ? { ...(base.funnelDomains as any) }
      : {};

  if (domain) funnelDomains[funnelId] = domain;
  else delete funnelDomains[funnelId];

  base.funnelDomains = funnelDomains;
  return base;
}

function readFunnelSeo(settingsJson: unknown, funnelId: string): FunnelSeo | null {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return null;
  const raw = (settingsJson as any).funnelSeo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = (raw as any)[funnelId];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;

  const title = typeof (row as any).title === "string" ? (row as any).title.trim().slice(0, 120) : "";
  const description = typeof (row as any).description === "string" ? (row as any).description.trim().slice(0, 300) : "";
  const imageUrl = typeof (row as any).imageUrl === "string" ? (row as any).imageUrl.trim().slice(0, 500) : "";
  const noIndex = (row as any).noIndex === true;

  const out: FunnelSeo = {};
  if (title) out.title = title;
  if (description) out.description = description;
  if (imageUrl) out.imageUrl = imageUrl;
  if (noIndex) out.noIndex = true;

  return Object.keys(out).length ? out : null;
}

function safeSeo(raw: unknown): FunnelSeo | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const title = typeof (raw as any).title === "string" ? (raw as any).title.trim().slice(0, 120) : "";
  const description = typeof (raw as any).description === "string" ? (raw as any).description.trim().slice(0, 300) : "";
  const imageUrl = typeof (raw as any).imageUrl === "string" ? (raw as any).imageUrl.trim().slice(0, 500) : "";
  const noIndex = (raw as any).noIndex === true;

  const out: FunnelSeo = {};
  if (title) out.title = title;
  if (description) out.description = description;
  if (imageUrl) out.imageUrl = imageUrl;
  if (noIndex) out.noIndex = true;
  return out;
}

function writeFunnelSeo(settingsJson: unknown, funnelId: string, seo: FunnelSeo | null) {
  const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
  const funnelSeo =
    base.funnelSeo && typeof base.funnelSeo === "object" && !Array.isArray(base.funnelSeo)
      ? { ...(base.funnelSeo as any) }
      : {};

  if (seo === null) delete funnelSeo[funnelId];
  else funnelSeo[funnelId] = seo;

  base.funnelSeo = funnelSeo;
  return base;
}

function removeFunnelFromDomainRedirects(settingsJson: unknown, funnelSlug: string) {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) return settingsJson;
  const base: any = { ...(settingsJson as any) };
  const customDomains =
    base.customDomains && typeof base.customDomains === "object" && !Array.isArray(base.customDomains)
      ? { ...(base.customDomains as any) }
      : null;
  if (!customDomains) return base;

  let changed = false;
  for (const [domain, row] of Object.entries(customDomains)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rootMode = typeof (row as any).rootMode === "string" ? String((row as any).rootMode).trim().toUpperCase() : "";
    const rootFunnelSlug = typeof (row as any).rootFunnelSlug === "string" ? String((row as any).rootFunnelSlug).trim().toLowerCase() : "";
    if (rootMode === "REDIRECT" && rootFunnelSlug && rootFunnelSlug === funnelSlug) {
      customDomains[domain] = { ...(row as any), rootMode: "DIRECTORY", rootFunnelSlug: null };
      changed = true;
    }
  }

  if (!changed) return base;
  base.customDomains = customDomains;
  return base;
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

export async function GET(_req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
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

  const settings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
    .catch(() => null);
  const funnelDomains = readFunnelDomains(settings?.dataJson ?? null);

  const seo = readFunnelSeo(settings?.dataJson ?? null, funnel.id);

  return NextResponse.json({ ok: true, funnel: { ...funnel, assignedDomain: funnelDomains[funnel.id] ?? null, seo } });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
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

  const wantsDomainUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "domain");
  const requestedDomainRaw = wantsDomainUpdate ? (body as any).domain : undefined;
  const requestedDomain =
    requestedDomainRaw === null
      ? null
      : typeof requestedDomainRaw === "string"
        ? normalizeDomain(requestedDomainRaw)
        : null;
  if (wantsDomainUpdate && requestedDomainRaw !== null && !requestedDomain) {
    return NextResponse.json({ ok: false, error: "Invalid domain" }, { status: 400 });
  }

  const wantsSeoUpdate = Object.prototype.hasOwnProperty.call(body ?? {}, "seo");
  const requestedSeoRaw = wantsSeoUpdate ? (body as any).seo : undefined;
  const requestedSeo = wantsSeoUpdate ? (requestedSeoRaw === null ? null : safeSeo(requestedSeoRaw)) : undefined;
  if (wantsSeoUpdate && requestedSeoRaw !== null && requestedSeo == null) {
    return NextResponse.json({ ok: false, error: "Invalid seo" }, { status: 400 });
  }

  if (wantsDomainUpdate && requestedDomain) {
    const exists = await prisma.creditCustomDomain.findUnique({
      where: { ownerId_domain: { ownerId: auth.session.user.id, domain: requestedDomain } },
      select: { id: true },
    });
    if (!exists) return NextResponse.json({ ok: false, error: "Domain not found" }, { status: 404 });
  }

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

  let assignedDomain: string | null = null;
  let seo: FunnelSeo | null = null;

  if (wantsDomainUpdate || wantsSeoUpdate) {
    const existingSettings = await prisma.creditFunnelBuilderSettings
      .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
      .catch(() => null);

    let nextJson: any = existingSettings?.dataJson ?? null;
    if (wantsDomainUpdate) nextJson = writeFunnelDomain(nextJson, funnel.id, requestedDomain);
    if (wantsSeoUpdate) nextJson = writeFunnelSeo(nextJson, funnel.id, (requestedSeo as any) ?? null);

    await prisma.creditFunnelBuilderSettings.upsert({
      where: { ownerId: auth.session.user.id },
      update: { dataJson: nextJson as any },
      create: { ownerId: auth.session.user.id, dataJson: nextJson as any },
      select: { ownerId: true },
    });

    const funnelDomains = readFunnelDomains(nextJson);
    assignedDomain = funnelDomains[funnel.id] ?? null;
    seo = readFunnelSeo(nextJson, funnel.id);
  } else {
    const settings = await prisma.creditFunnelBuilderSettings
      .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
      .catch(() => null);
    const settingsJson = settings?.dataJson ?? null;
    const funnelDomains = readFunnelDomains(settingsJson);
    assignedDomain = funnelDomains[funnel.id] ?? null;
    seo = readFunnelSeo(settingsJson, funnel.id);
  }

  return NextResponse.json({ ok: true, funnel: { ...funnel, assignedDomain, seo } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ funnelId: string }> }) {
  const auth = await requireFunnelBuilderSession();
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
    select: { id: true, slug: true },
  });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Best-effort: clean up settings references (assigned domain + SEO + root redirect) before deleting.
  try {
    const settings = await prisma.creditFunnelBuilderSettings
      .findUnique({ where: { ownerId: auth.session.user.id }, select: { dataJson: true } })
      .catch(() => null);
    const settingsJson = settings?.dataJson ?? null;
    let nextJson: any = settingsJson;
    nextJson = writeFunnelDomain(nextJson, existing.id, null);
    nextJson = writeFunnelSeo(nextJson, existing.id, null);
    nextJson = removeFunnelFromDomainRedirects(nextJson, existing.slug);

    if (settingsJson != null) {
      await prisma.creditFunnelBuilderSettings.update({
        where: { ownerId: auth.session.user.id },
        data: { dataJson: nextJson as any },
        select: { ownerId: true },
      });
    }
  } catch {
    // ignore
  }

  await prisma.creditFunnel.delete({ where: { id: existing.id }, select: { id: true } });
  return NextResponse.json({ ok: true });
}
