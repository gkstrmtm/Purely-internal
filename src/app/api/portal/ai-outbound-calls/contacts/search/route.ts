import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeQuery(raw: string | null): string {
  const q = String(raw || "").trim();
  if (!q) return "";
  return q.slice(0, 80);
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("aiOutboundCalls");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const q = normalizeQuery(url.searchParams.get("q"));
  const take = Math.max(1, Math.min(20, Number(url.searchParams.get("take") || 20) || 20));

  if (!q || q.length < 2) {
    return NextResponse.json({ ok: true, contacts: [] });
  }

  // Basic, fast search. (We keep this permissive so users can type name/email/phone fragments.)
  const contacts = await prisma.portalContact.findMany({
    where: {
      ownerId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
  });

  return NextResponse.json({
    ok: true,
    contacts: contacts.map((c) => ({
      id: String(c.id),
      name: c.name ? String(c.name) : null,
      email: c.email ? String(c.email) : null,
      phone: c.phone ? String(c.phone) : null,
    })),
  });
}
