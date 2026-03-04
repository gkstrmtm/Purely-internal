import { resolve4, resolve6, resolveCname } from "dns/promises";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeDnsName(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "");
}

function isLikelyApexDomain(domain: string): boolean {
  const s = normalizeDnsName(domain);
  if (!s) return true;
  if (s.startsWith("www.")) return false;
  const parts = s.split(".").filter(Boolean);
  return parts.length <= 2;
}

function coerceExpectedTargetHost(req: Request): string | null {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (raw) {
    try {
      return new URL(raw).hostname || null;
    } catch {
      // ignore
    }
  }

  const host = req.headers.get("host") || "";
  const stripped = host.split(":")[0] || "";
  return stripped.trim() || null;
}

async function resolveCnameChain(host: string, maxDepth = 6) {
  const out: string[] = [];
  let current = normalizeDnsName(host);

  for (let i = 0; i < maxDepth; i++) {
    if (!current) break;
    const cnames = await resolveCname(current).catch(() => []);
    const normalized = cnames.map((c) => normalizeDnsName(c)).filter(Boolean);
    if (normalized.length === 0) break;

    for (const c of normalized) out.push(c);

    // Follow the first CNAME to continue the chain.
    current = normalized[0] || "";
  }

  return Array.from(new Set(out));
}

function intersects(a: string[], b: string[]) {
  const s = new Set(a);
  return b.some((x) => s.has(x));
}

export async function POST(req: Request, ctx: { params: Promise<{ domainId: string }> }) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { domainId } = await ctx.params;
  const id = String(domainId || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing domain id" }, { status: 400 });

  const ownerId = auth.session.user.id;
  const domainRow = await prisma.creditCustomDomain.findFirst({
    where: { id, ownerId },
    select: { id: true, domain: true, status: true, verifiedAt: true },
  });

  if (!domainRow) return NextResponse.json({ ok: false, error: "Domain not found" }, { status: 404 });

  const domain = normalizeDnsName(domainRow.domain);
  if (!domain) return NextResponse.json({ ok: false, error: "Invalid domain" }, { status: 400 });

  const expectedTargetHost = normalizeDnsName(coerceExpectedTargetHost(req) || "");
  if (!expectedTargetHost) {
    return NextResponse.json(
      { ok: false, error: "Missing NEXT_PUBLIC_APP_URL; can’t determine DNS target" },
      { status: 500 },
    );
  }

  const isApex = isLikelyApexDomain(domain);

  const debug: any = {
    domain,
    expectedTargetHost,
    checks: {
      cnameChain: [] as string[],
      domainA: [] as string[],
      targetA: [] as string[],
      domainAAAA: [] as string[],
      targetAAAA: [] as string[],
    },
  };

  try {
    const cnameChain = await resolveCnameChain(domain);
    debug.checks.cnameChain = cnameChain;

    if (cnameChain.includes(expectedTargetHost)) {
      const updated = await prisma.creditCustomDomain.update({
        where: { id: domainRow.id },
        data: { status: "VERIFIED", verifiedAt: new Date() },
        select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
      });
      return NextResponse.json({ ok: true, verified: true, domain: updated, debug });
    }

    // For apex domains (ALIAS/ANAME), the CNAME chain often won’t be visible.
    // Best-effort: compare resolved IPs to our platform target.
    const [domainA, domainAAAA, targetA, targetAAAA] = await Promise.all([
      resolve4(domain).catch(() => []),
      resolve6(domain).catch(() => []),
      resolve4(expectedTargetHost).catch(() => []),
      resolve6(expectedTargetHost).catch(() => []),
    ]);

    debug.checks.domainA = domainA;
    debug.checks.domainAAAA = domainAAAA;
    debug.checks.targetA = targetA;
    debug.checks.targetAAAA = targetAAAA;

    const ipMatch = intersects(domainA, targetA) || intersects(domainAAAA, targetAAAA);

    if (ipMatch) {
      const updated = await prisma.creditCustomDomain.update({
        where: { id: domainRow.id },
        data: { status: "VERIFIED", verifiedAt: new Date() },
        select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
      });
      return NextResponse.json({ ok: true, verified: true, domain: updated, debug: { ...debug, isApex } });
    }

    return NextResponse.json({
      ok: true,
      verified: false,
      error: isApex
        ? "DNS doesn’t resolve to the platform yet"
        : "CNAME doesn’t point to the platform yet",
      debug: { ...debug, isApex },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: true,
        verified: false,
        error: "DNS lookup failed",
        details: e instanceof Error ? e.message : "Unknown error",
        debug: { ...debug, isApex },
      },
      { status: 200 },
    );
  }
}
