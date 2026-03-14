import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireManager(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const, userId: null as any };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const, userId };
  return { ok: true as const, status: 200 as const, userId };
}

export async function DELETE(_req: Request, ctx: { params: { ownerId: string } }) {
  const session = await getServerSession(authOptions);
  const auth = requireManager(session);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = String(ctx?.params?.ownerId || "").trim();
  if (!ownerId) return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });

  if (auth.userId === ownerId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  // "Delete" is implemented as a safe deactivation to avoid FK cascades.
  await prisma.user.update({
    where: { id: ownerId },
    data: { active: false },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
