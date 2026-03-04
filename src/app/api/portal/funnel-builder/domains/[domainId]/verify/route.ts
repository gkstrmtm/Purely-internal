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

function uniq(xs: string[]) {
  return Array.from(new Set(xs.filter(Boolean)));
}

function isVercelRuntime() {
  return String(process.env.VERCEL || "").trim() === "1";
}

function pickVercelConfig() {
  const token = (process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN || "").trim();
  const projectIdOrName = (
    process.env.VERCEL_PROJECT_ID ||
    process.env.VERCEL_PROJECT_ID_OR_NAME ||
    process.env.VERCEL_PROJECT_NAME ||
    ""
  ).trim();
  const teamId = (process.env.VERCEL_TEAM_ID || "").trim();
  return { token: token || null, projectIdOrName: projectIdOrName || null, teamId: teamId || null };
}

function formatVercelVerificationRecords(verification: any): string {
  if (!Array.isArray(verification) || verification.length === 0) return "";
  const lines = verification
    .map((v) => {
      const type = typeof v?.type === "string" ? v.type.trim() : "";
      const host = typeof v?.domain === "string" ? v.domain.trim() : "";
      const value = typeof v?.value === "string" ? v.value.trim() : "";
      if (!type || !host || !value) return null;
      return `${type} ${host} = ${value}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return ` Required verification record(s): ${lines.join(" | ")}.`;
}

async function ensureVercelProjectDomain(domain: string) {
  const { token, projectIdOrName, teamId } = pickVercelConfig();
  if (!token || !projectIdOrName) {
    return {
      ok: false as const,
      configured: false as const,
      error: "Platform domain provisioning is not configured",
    };
  }

  const qp = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Add domain (ignore if already exists on project).
  const addRes = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectIdOrName)}/domains${qp}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: domain }),
  }).catch(() => null);

  let addJson: any = null;
  if (addRes) {
    addJson = await addRes.json().catch(() => null);
  }

  // If already exists, Vercel returns 400.
  const addOk = !!addRes && (addRes.ok || addRes.status === 400);
  if (!addOk) {
    return {
      ok: false as const,
      configured: true as const,
      error: "Failed to add domain to hosting project",
      debug: { status: addRes?.status, body: addJson },
    };
  }

  // Verify domain for the project (this triggers/reads Vercel verification challenges).
  const verifyRes = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}/domains/${encodeURIComponent(domain)}/verify${qp}`,
    {
      method: "POST",
      headers,
    },
  ).catch(() => null);

  const verifyJson = verifyRes ? await verifyRes.json().catch(() => null) : null;
  if (!verifyRes || !verifyRes.ok) {
    return {
      ok: false as const,
      configured: true as const,
      error: "Failed to verify domain on hosting project",
      debug: { status: verifyRes?.status, body: verifyJson },
    };
  }

  return {
    ok: true as const,
    configured: true as const,
    verified: !!verifyJson?.verified,
    verification: Array.isArray(verifyJson?.verification) ? verifyJson.verification : null,
    raw: verifyJson,
  };
}

async function checkHttpsReachable(domain: string) {
  try {
    const res = await fetch(`https://${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    // Treat any response as "reachable" (even 404) — the point is TLS + connection.
    return { ok: true as const, status: res.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: msg };
  }
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
    vercel: { configured: false },
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
      // DNS is good. Proceed to hosting SSL/provisioning checks.
      const vercel = await ensureVercelProjectDomain(domain);
      debug.vercel = vercel;
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

      if (!vercel.configured) {
        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            "DNS is pointing correctly, but the platform is missing domain provisioning configuration (SSL can’t be activated automatically). Please contact support.",
          domain: current,
          debug,
        });
      }

      if (vercel.ok && vercel.verified === false && vercel.verification?.length) {
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
          "DNS is pointing correctly, but the domain isn’t reachable over HTTPS yet (SSL/certificate still provisioning). Please wait a few minutes and click Verify DNS again.",
        domain: current,
        debug,
      });
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

    const domainAuniq = uniq(domainA);
    const domainAAAAuniq = uniq(domainAAAA);
    const targetAuniq = uniq(targetA);
    const targetAAAAuniq = uniq(targetAAAA);

    // Vercel apex domains often resolve to 76.76.21.21, even if the platform host resolves to a different Vercel edge IP.
    const allowedApexA = uniq([...(targetAuniq || []), ...(isVercelRuntime() ? ["76.76.21.21"] : [])]);
    const allowedApexAAAA = uniq([...(targetAAAAuniq || [])]);

    const aHasMatch = allowedApexA.length ? intersects(domainAuniq, allowedApexA) : intersects(domainAuniq, targetAuniq);
    const aaaaHasMatch = allowedApexAAAA.length
      ? intersects(domainAAAAuniq, allowedApexAAAA)
      : intersects(domainAAAAuniq, targetAAAAuniq);

    const extraA = allowedApexA.length ? domainAuniq.filter((ip) => !allowedApexA.includes(ip)) : [];
    const extraAAAA = allowedApexAAAA.length ? domainAAAAuniq.filter((ip) => !allowedApexAAAA.includes(ip)) : [];

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
              ? `Your domain has A records that don’t point to the platform (${extraA.join(", ")}). Remove the conflicting record(s) so it only points to Purely Automation.`
              : `Your domain has AAAA records that don’t point to the platform (${extraAAAA.join(", ")}). Remove the conflicting record(s) so it only points to Purely Automation.`,
          domain: current,
          debug: { ...debug, isApex, extraA, extraAAAA },
        });
      }

      const vercel = await ensureVercelProjectDomain(domain);
      debug.vercel = vercel;
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

      if (!vercel.configured) {
        return NextResponse.json({
          ok: true,
          verified: false,
          error:
            "DNS is pointing correctly, but the platform is missing domain provisioning configuration (SSL can’t be activated automatically). Please contact support.",
          domain: current,
          debug: { ...debug, isApex },
        });
      }

      if (vercel.ok && vercel.verified === false && vercel.verification?.length) {
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
          "DNS is pointing correctly, but the domain isn’t reachable over HTTPS yet (SSL/certificate still provisioning). Please wait a few minutes and click Verify DNS again.",
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
