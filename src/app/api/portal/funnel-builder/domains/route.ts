import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

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

  // Very small sanity check; full DNS validation/verification happens elsewhere.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  if (s.includes("..")) return null;
  if (s.startsWith("-") || s.endsWith("-")) return null;

  return s;
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
  const domains = await prisma.creditCustomDomain.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, domain: true, status: true, verifiedAt: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, domains });
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
