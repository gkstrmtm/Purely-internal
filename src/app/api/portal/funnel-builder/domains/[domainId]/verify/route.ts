import { Resolver, resolve4, resolve6, resolveCname, resolveNs } from "dns/promises";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  checkHttpsReachable,
  ensureVercelProjectDomain,
  formatVercelVerificationRecords,
} from "@/lib/vercelProjectDomains";

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

function coerceExpectedTargetHost(): string | null {
  const explicit = (process.env.CUSTOM_DOMAIN_TARGET_HOST || "").trim();
  if (explicit) return normalizeDnsName(explicit) || null;

  // Default: Vercel DNS target for project domains.
  // (Root domains may use ALIAS/ANAME to this target, or A=76.76.21.21.)
  return "cname.vercel-dns.com";
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
    current = normalized[0] || "";
  }

  return Array.from(new Set(out));
}

async function resolveAuthoritativeA(domain: string) {
  const nsHosts = await resolveNs(domain).catch(() => [] as string[]);
  const ns = nsHosts.map((h) => normalizeDnsName(h)).filter(Boolean);
  if (!ns.length) return { ns: [] as string[], a: [] as string[] };

  const allA: string[] = [];

  for (const nsHost of ns.slice(0, 6)) {
    // Resolver.setServers expects IPs; resolve nameserver host -> IP first.
    const nsIps = await resolve4(nsHost).catch(() => [] as string[]);
    const nsIp = nsIps[0];
    if (!nsIp) continue;

    const r = new Resolver();
    try {
      r.setServers([nsIp]);
      const a = await r.resolve4(domain).catch(() => [] as string[]);
      for (const ip of a) allA.push(String(ip || "").trim());
    } catch {
      // ignore
    }
  }

  return { ns, a: uniq(allA) };
}

function intersects(a: string[], b: string[]) {
  const s = new Set(a);
  return b.some((x) => s.has(x));
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs.filter(Boolean)));
}

function isVercelApexARecord(ip: string, platformARecords: string[]): boolean {
  const s = String(ip || "").trim();
  if (!s) return false;
  if (s === "76.76.21.21") return true;
  // Vercel commonly uses 76.76.21.0/24 for apex domains.
  if (s.startsWith("76.76.21.")) return true;
  return platformARecords.includes(s);
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

  const expectedTargetHost = normalizeDnsName(coerceExpectedTargetHost() || "");
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
    vercel: { configured: false },
    checks: {
      cnameChain: [] as string[],
      domainA: [] as string[],
      targetA: [] as string[],
      domainAAAA: [] as string[],
      targetAAAA: [] as string[],
      authoritativeNS: [] as string[],
      authoritativeA: [] as string[],
    },
  };

  try {
    const cnameChain = await resolveCnameChain(domain);
    debug.checks.cnameChain = cnameChain;

    if (cnameChain.includes(expectedTargetHost)) {
      // DNS is good. Proceed to hosting SSL/provisioning checks.
      const vercel = await ensureVercelProjectDomain(domain);
      debug.vercel = vercel;

      if (!vercel.configured) {
        if (domainRow.status === "VERIFIED") {
          await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
        }
        const current = await prisma.creditCustomDomain.findUnique({
          where: { id: domainRow.id },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            "DNS is pointing correctly, but the platform is missing domain provisioning configuration (SSL can’t be activated automatically). Please contact support.",
          domain: current,
          debug,
        });
      }

      // If Vercel isn't verified yet, SSL cannot be issued.
      if (vercel.ok && vercel.verified === false) {
        if (domainRow.status === "VERIFIED") {
          await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
        }
        const current = await prisma.creditCustomDomain.findUnique({
          where: { id: domainRow.id },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });

        if (vercel.verification?.length) {
          const recordsHint = formatVercelVerificationRecords(vercel.verification);
          return NextResponse.json({
            ok: true,
            verified: false,
            error:
              `DNS is pointing correctly, but the domain still needs a hosting verification record before SSL can be issued.${recordsHint} After adding it, wait a minute and click Verify DNS again.`,
            domain: current,
            debug,
          });
        }

        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            `DNS is pointing correctly, but the hosting provider still hasn’t verified the domain yet. Make sure your DNS record points to ${expectedTargetHost} (or A=76.76.21.21 for root domains), then wait a minute and click Verify DNS again.`,
          domain: current,
          debug,
        });
      }

      if (!vercel.ok) {
        const scopeHint = process.env.VERCEL_TEAM_ID
          ? " If your Vercel project is NOT under a Team, the configured team scope may be wrong — remove the Team ID and retry."
          : "";
        if (domainRow.status === "VERIFIED") {
          await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
        }
        const current = await prisma.creditCustomDomain.findUnique({
          where: { id: domainRow.id },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            `DNS is pointing correctly, but hosting verification/provisioning failed (${vercel.error}).${scopeHint}`,
          domain: current,
          debug,
        });
      }

      const https = await checkHttpsReachable(domain);
      debug.https = https;

      const ready = vercel.ok && vercel.verified && https.ok;
      if (ready) {
        const updated = await prisma.creditCustomDomain.update({
          where: { id: domainRow.id },
          data: { status: "VERIFIED", verifiedAt: new Date() },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({ ok: true, verified: true, domain: updated, debug });
      }

      if (domainRow.status === "VERIFIED") {
        await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
      }

      const current = await prisma.creditCustomDomain.findUnique({
        where: { id: domainRow.id },
        select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
      });

      return NextResponse.json({
        ok: true,
        verified: false,
        error:
          https.ok
            ? "DNS is pointing correctly, but the domain isn’t reachable over HTTPS yet (SSL/certificate still provisioning). Please wait a few minutes and click Verify DNS again."
            : `DNS is pointing correctly, but HTTPS isn’t ready yet (SSL/certificate still provisioning). Last check error: ${https.error}. Please wait a few minutes and click Verify DNS again.`,
        domain: current,
        debug,
      });
    }

    // For apex domains (ALIAS/ANAME), the CNAME chain often won’t be visible.
    // Best-effort: compare resolved IPs to our platform target.
    const [domainA, domainAAAA, targetA, targetAAAA, authoritative] = await Promise.all([
      resolve4(domain).catch(() => [] as string[]),
      resolve6(domain).catch(() => [] as string[]),
      resolve4(expectedTargetHost).catch(() => [] as string[]),
      resolve6(expectedTargetHost).catch(() => [] as string[]),
      resolveAuthoritativeA(domain).catch(() => ({ ns: [] as string[], a: [] as string[] })),
    ]);

    debug.checks.domainA = domainA;
    debug.checks.domainAAAA = domainAAAA;
    debug.checks.targetA = targetA;
    debug.checks.targetAAAA = targetAAAA;
    debug.checks.authoritativeNS = authoritative.ns;
    debug.checks.authoritativeA = authoritative.a;

    const domainAuniq = uniq(authoritative.a.length ? authoritative.a : domainA);
    const domainAAAAuniq = uniq(domainAAAA);
    const targetAuniq = uniq(targetA);
    const targetAAAAuniq = uniq(targetAAAA);

    // Vercel apex domains often resolve to 76.76.21.21, but may also use other 76.76.21.* IPs.
    // Treat any 76.76.21.* as acceptable, plus whatever the platform target currently resolves to.
    const domainAvercel = domainAuniq.filter((ip) => isVercelApexARecord(ip, targetAuniq));
    const extraA = domainAuniq.filter((ip) => !isVercelApexARecord(ip, targetAuniq));

    const aHasMatch = domainAvercel.length > 0;
    const aaaaHasMatch = targetAAAAuniq.length ? intersects(domainAAAAuniq, targetAAAAuniq) : false;
    const extraAAAA = targetAAAAuniq.length ? domainAAAAuniq.filter((ip) => !targetAAAAuniq.includes(ip)) : [];

    const dnsOk = aHasMatch || aaaaHasMatch;

    if (dnsOk) {
      // If there are extra IPs, treat as not ready: it can randomly route to the wrong place.
      if (extraA.length || extraAAAA.length) {
        if (domainRow.status === "VERIFIED") {
          await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
        }
        const current = await prisma.creditCustomDomain.findUnique({
          where: { id: domainRow.id },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            extraA.length
              ? `Not verified yet: your root domain resolves to multiple A records. Vercel is present (${domainAvercel.join(", ") || "(none)"}), but you also have non-platform IP(s) (${extraA.join(", ")}). This usually means there’s still an A record on host “@” pointing to a parking/old host. Delete the A record(s) for “@” that point to ${extraA.join(", ")}, leaving only ALIAS/ANAME -> ${expectedTargetHost} (or A -> 76.76.21.21).`
              : `Your domain has AAAA records that don’t point to the platform (${extraAAAA.join(", ")}). Remove the conflicting record(s) so it only points to Purely Automation.`,
          domain: current,
          debug: { ...debug, isApex, extraA, extraAAAA, domainAvercel },
        });
      }

      const vercel = await ensureVercelProjectDomain(domain);
      debug.vercel = vercel;

      if (!vercel.configured) {
        if (domainRow.status === "VERIFIED") {
          await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
        }
        const current = await prisma.creditCustomDomain.findUnique({
          where: { id: domainRow.id },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            "DNS is pointing correctly, but the platform is missing domain provisioning configuration (SSL can’t be activated automatically). Please contact support.",
          domain: current,
          debug: { ...debug, isApex },
        });
      }

      if (vercel.ok && vercel.verified === false) {
        if (domainRow.status === "VERIFIED") {
          await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
        }
        const current = await prisma.creditCustomDomain.findUnique({
          where: { id: domainRow.id },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });

        if (vercel.verification?.length) {
          const recordsHint = formatVercelVerificationRecords(vercel.verification);
          return NextResponse.json({
            ok: true,
            verified: false,
            error:
              `DNS is pointing correctly, but the domain still needs a hosting verification record before SSL can be issued.${recordsHint} After adding it, wait a minute and click Verify DNS again.`,
            domain: current,
            debug: { ...debug, isApex },
          });
        }

        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            "DNS is pointing correctly, but the hosting provider still hasn’t verified the domain yet. For root domains, use ALIAS/ANAME -> cname.vercel-dns.com or A -> 76.76.21.21, then wait a minute and click Verify DNS again.",
          domain: current,
          debug: { ...debug, isApex },
        });
      }

      if (!vercel.ok) {
        if (domainRow.status === "VERIFIED") {
          await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
        }
        const current = await prisma.creditCustomDomain.findUnique({
          where: { id: domainRow.id },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            `DNS is pointing correctly, but hosting verification/provisioning failed (${vercel.error}). Please contact support.`,
          domain: current,
          debug: { ...debug, isApex },
        });
      }

      const https = await checkHttpsReachable(domain);
      debug.https = https;

      const ready = vercel.ok && vercel.verified && https.ok;
      if (ready) {
        const updated = await prisma.creditCustomDomain.update({
          where: { id: domainRow.id },
          data: { status: "VERIFIED", verifiedAt: new Date() },
          select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json({ ok: true, verified: true, domain: updated, debug: { ...debug, isApex } });
      }

      if (domainRow.status === "VERIFIED") {
        await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
      }

      const current = await prisma.creditCustomDomain.findUnique({
        where: { id: domainRow.id },
        select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
      });

      return NextResponse.json({
        ok: true,
        verified: false,
        error:
          https.ok
            ? "DNS is pointing correctly, but the domain isn’t reachable over HTTPS yet (SSL/certificate still provisioning). Please wait a few minutes and click Verify DNS again."
            : `DNS is pointing correctly, but HTTPS isn’t ready yet (SSL/certificate still provisioning). Last check error: ${https.error}. Please wait a few minutes and click Verify DNS again.`,
        domain: current,
        debug: { ...debug, isApex },
      });
    }

    if (domainRow.status === "VERIFIED") {
      await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
    }

    const current = await prisma.creditCustomDomain.findUnique({
      where: { id: domainRow.id },
      select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({
      ok: true,
      verified: false,
      error: isApex
        ? "DNS doesn’t resolve to the platform yet"
        : "CNAME doesn’t point to the platform yet",
      domain: current,
      debug: { ...debug, isApex },
    });
  } catch (e) {
    if (domainRow.status === "VERIFIED") {
      await prisma.creditCustomDomain.update({ where: { id: domainRow.id }, data: { status: "PENDING", verifiedAt: null } });
    }

    const current = await prisma.creditCustomDomain.findUnique({
      where: { id: domainRow.id },
      select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(
      {
        ok: true,
        verified: false,
        error: "DNS lookup failed",
        details: e instanceof Error ? e.message : "Unknown error",
        domain: current,
        debug: { ...debug, isApex },
      },
      { status: 200 },
    );
  }
}
