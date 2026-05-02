import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { listPortalAccountMembers } from "@/lib/portalAccounts";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("leadScraping", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, email: true, name: true, active: true },
  });

  const rows = await listPortalAccountMembers(ownerId).catch(() => [] as any[]);

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
    ...rows.map((row) => ({
      userId: String(row.userId),
      role: String(row.role || "MEMBER"),
      user: row.user,
      implicit: false,
    })),
  ].filter((member, index, all) => all.findIndex((candidate) => candidate.userId === member.userId) === index);

  return NextResponse.json({ ok: true, ownerId, members });
}