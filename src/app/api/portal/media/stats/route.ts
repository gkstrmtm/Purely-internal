import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;

  const [itemsCount, foldersCount] = await Promise.all([
    (prisma as any).portalMediaItem.count({ where: { ownerId } }),
    (prisma as any).portalMediaFolder.count({ where: { ownerId } }),
  ]);

  return NextResponse.json({ ok: true, itemsCount, foldersCount });
}
