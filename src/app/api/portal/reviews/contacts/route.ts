import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getActiveArchivedEntityIdSet, RECOVERABILITY_ENTITY_TYPES } from "@/lib/recoverability";

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
      take: Math.min(150, take * 3),
      select: { id: true, name: true, email: true, phone: true, updatedAt: true },
    });

    const archivedIds = await getActiveArchivedEntityIdSet({
      ownerId,
      entityType: RECOVERABILITY_ENTITY_TYPES.CONTACT,
      entityIds: (rows || []).map((row: any) => String(row?.id || "")).filter(Boolean),
    });

    const visibleRows = archivedIds.size
      ? (rows || []).filter((row: any) => !archivedIds.has(String(row?.id || "")))
      : rows || [];

    const contacts = visibleRows.slice(0, take).map((c: any) => ({
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
