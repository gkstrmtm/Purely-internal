import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTxt } from "dns/promises";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { hasPublicColumn } from "@/lib/dbSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  domain: z.string().trim().min(1),
});

function normalizeDomain(raw: string) {
  const v = String(raw || "").trim().toLowerCase();
  const withoutProtocol = v.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const d = withoutPath.replace(/:\d+$/, "");
  return d;
}

function flattenTxt(rows: string[][]) {
  const out: string[] = [];
  for (const r of rows) out.push(r.join(""));
  return out;
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const [hasPrimaryDomain, hasVerificationToken, hasVerifiedAt] = await Promise.all([
    hasPublicColumn("ClientBlogSite", "primaryDomain"),
    hasPublicColumn("ClientBlogSite", "verificationToken"),
    hasPublicColumn("ClientBlogSite", "verifiedAt"),
  ]);

  if (!hasPrimaryDomain || !hasVerificationToken) {
    return NextResponse.json(
      {
        ok: false,
        verified: false,
        error: "Blog domain verification isn’t available yet (database migration pending).",
      },
      { status: 409 },
    );
  }

  const site = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { id: true, primaryDomain: true, verificationToken: true, verifiedAt: true },
  });

  if (!site) return NextResponse.json({ error: "No blog site found" }, { status: 404 });

  const domain = normalizeDomain(parsed.data.domain);
  if (!domain) return NextResponse.json({ error: "Invalid domain" }, { status: 400 });

  if ((site.primaryDomain ?? "") !== domain) {
    return NextResponse.json(
      { error: "Domain does not match the one saved in your blog settings" },
      { status: 400 },
    );
  }

  // Verification record:
  // - Name: _purelyautomation.<domain>
  // - Value: verify=<token>
  const recordName = `_purelyautomation.${domain}`;
  const expected = `verify=${site.verificationToken}`;

  try {
    const txt = await resolveTxt(recordName);
    const values = flattenTxt(txt);
    const ok = values.some((v) => String(v).trim() === expected);

    if (!ok) {
      return NextResponse.json({
        ok: false,
        verified: false,
        error: "TXT record not found yet",
        recordName,
        expected,
        found: values.slice(0, 25),
      });
    }

    const updated = await prisma.clientBlogSite.update({
      where: { id: site.id },
      data: { ...(hasVerifiedAt ? { verifiedAt: new Date() } : {}) },
      select: { id: true, primaryDomain: true, ...(hasVerifiedAt ? { verifiedAt: true } : {}) } as any,
    });

    return NextResponse.json({
      ok: true,
      verified: true,
      site: {
        ...updated,
        verifiedAt: hasVerifiedAt
          ? ((updated as any).verifiedAt instanceof Date
              ? (updated as any).verifiedAt.toISOString()
              : (updated as any).verifiedAt ?? null)
          : null,
      },
      recordName,
      expected,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        verified: false,
        error: "DNS lookup failed",
        details: e instanceof Error ? e.message : "Unknown error",
        recordName,
        expected,
      },
      { status: 200 },
    );
  }
}
