import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireManager(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const };
  return { ok: true as const, userId };
}

const bodySchema = z.object({
  ownerId: z.string().trim().min(1).max(64),
  amount: z.number().int().min(1).max(1_000_000),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = requireManager(session);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { ownerId, amount } = parsed.data;

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, role: true } }).catch(() => null);
  if (!owner || owner.role !== "CLIENT") {
    return NextResponse.json({ error: "Unknown portal user" }, { status: 404 });
  }

  const state = await addCredits(ownerId, amount);
  return NextResponse.json({ ok: true, balance: state.balance });
}
