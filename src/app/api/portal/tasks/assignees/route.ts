import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalTasksSchema } from "@/lib/portalTasksSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("tasks");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalTasksSchema().catch(() => null);

  const ownerId = auth.session.user.id;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, email: true, name: true, active: true },
  });

  const rows = (await prisma.portalAccountMember.findMany({
    where: { ownerId },
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, email: true, name: true, active: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  })) as any[];

  const members = [
    ...(owner
      ? [
          {
            userId: owner.id,
            role: "OWNER",
            user: { id: owner.id, email: owner.email, name: owner.name, active: owner.active },
            implicit: true,
          },
        ]
      : []),
    ...rows.map((r) => ({
      userId: String(r.userId),
      role: String(r.role || "MEMBER"),
      user: r.user,
      implicit: false,
    })),
  ].filter((m, idx, arr) => arr.findIndex((x) => x.userId === m.userId) === idx);

  return NextResponse.json({ ok: true, ownerId, members });
}
