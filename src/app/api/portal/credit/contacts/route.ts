import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
}

export async function GET(req: Request) {
  const session = await requireCreditClientSession();
  if (!session.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: session.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const qKey = normalizeKey(q);

  const contacts = await prisma.portalContact.findMany({
    where: {
      ownerId: session.session.user.id,
      ...(qKey
        ? {
            OR: [{ nameKey: { contains: qKey } }, { emailKey: { contains: qKey } }, { phoneKey: { contains: qKey } }],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, contacts });
}
