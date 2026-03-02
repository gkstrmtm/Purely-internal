import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("reviews");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const take = Math.max(1, Math.min(50, Number(url.searchParams.get("take") || "20") || 20));

  try {
    const where: any = { ownerId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await (prisma as any).portalContact.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, name: true, email: true, phone: true, updatedAt: true },
    });

    const contacts = (rows || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name || "").trim(),
      email: c.email ? String(c.email) : null,
      phone: c.phone ? String(c.phone) : null,
      updatedAtIso: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    }));

    return NextResponse.json({ ok: true, contacts });
  } catch {
    // Drift-hardening: if PortalContact isn’t installed yet, treat as empty.
    return NextResponse.json({ ok: true, contacts: [] });
  }
}
