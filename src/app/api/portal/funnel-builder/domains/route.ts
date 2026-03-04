import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DomainRootMode = "DISABLED" | "DIRECTORY" | "REDIRECT";

function safeRootMode(raw: unknown): DomainRootMode {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (s === "DISABLED" || s === "DIRECTORY" || s === "REDIRECT") return s;
  return "DIRECTORY";
}

function safeSlug(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!s) return null;
  if (s.length > 80) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return null;
  return s;
}

function readDomainSettings(settingsJson: unknown, domain: string): { rootMode: DomainRootMode; rootFunnelSlug: string | null } {
  if (!settingsJson || typeof settingsJson !== "object" || Array.isArray(settingsJson)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const domains = (settingsJson as any).customDomains;
  if (!domains || typeof domains !== "object" || Array.isArray(domains)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const row = (domains as any)[domain];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { rootMode: "DIRECTORY", rootFunnelSlug: null };
  }
  const rootMode = safeRootMode((row as any).rootMode);
  const rootFunnelSlug = safeSlug((row as any).rootFunnelSlug);
  return { rootMode, rootFunnelSlug };
}

function writeDomainSettings(settingsJson: unknown, domain: string, next: { rootMode: DomainRootMode; rootFunnelSlug: string | null }) {
  const base = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? { ...(settingsJson as any) } : {};
  const customDomains =
    base.customDomains && typeof base.customDomains === "object" && !Array.isArray(base.customDomains)
      ? { ...(base.customDomains as any) }
      : {};
  customDomains[domain] = { rootMode: next.rootMode, rootFunnelSlug: next.rootFunnelSlug };
  base.customDomains = customDomains;
  return base;
}

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

  // Very small sanity check; full DNS validation/verification happens elsewhere.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  if (s.includes("..")) return null;
  if (s.startsWith("-") || s.endsWith("-")) return null;

  return s;
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
  const settingsJson = settings?.dataJson ?? null;

  const domains = await prisma.creditCustomDomain.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
  });

  const domainsWithSettings = domains.map((d) => {
    const s = readDomainSettings(settingsJson, d.domain);
    return { ...d, rootMode: s.rootMode, rootFunnelSlug: s.rootFunnelSlug };
  });

  return NextResponse.json({ ok: true, domains: domainsWithSettings });
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
  const domain = normalizeDomain(body?.domain);
  if (!domain) {
    return NextResponse.json({ ok: false, error: "Invalid domain" }, { status: 400 });
  }

  const row = await prisma.creditCustomDomain
    .upsert({
      where: { ownerId_domain: { ownerId, domain } },
      update: { domain },
      create: { ownerId, domain },
      select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
    })
    .catch((e) => {
      const msg = String((e as any)?.message || "");
      if (msg.includes("CreditCustomDomain_ownerId_domain_key") || msg.toLowerCase().includes("unique")) return null;
      throw e;
    });

  if (!row) {
    return NextResponse.json({ ok: false, error: "Domain already exists" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, domain: row });
}

export async function PATCH(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as any;
  const domain = normalizeDomain(body?.domain);
  if (!domain) return NextResponse.json({ ok: false, error: "Invalid domain" }, { status: 400 });

  const exists = await prisma.creditCustomDomain.findUnique({
    where: { ownerId_domain: { ownerId, domain } },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ ok: false, error: "Domain not found" }, { status: 404 });

  const rootMode = safeRootMode(body?.rootMode);
  const rootFunnelSlug = safeSlug(body?.rootFunnelSlug);
  if (rootMode === "REDIRECT" && !rootFunnelSlug) {
    return NextResponse.json({ ok: false, error: "Pick a funnel to redirect to" }, { status: 400 });
  }
  if (rootMode !== "REDIRECT" && body?.rootFunnelSlug != null) {
    // Allow clearing if not redirect.
  }

  const existingSettings = await prisma.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const nextJson = writeDomainSettings(existingSettings?.dataJson ?? null, domain, {
    rootMode,
    rootFunnelSlug: rootMode === "REDIRECT" ? rootFunnelSlug : null,
  });

  await prisma.creditFunnelBuilderSettings.upsert({
    where: { ownerId },
    update: { dataJson: nextJson as any },
    create: { ownerId, dataJson: nextJson as any },
    select: { ownerId: true },
  });

  return NextResponse.json({ ok: true, domain, rootMode, rootFunnelSlug: rootMode === "REDIRECT" ? rootFunnelSlug : null });
}
