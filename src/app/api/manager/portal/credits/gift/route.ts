import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { addCredits } from "@/lib/credits";
import { platformAdminAuthError } from "@/lib/platformAdminGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  ownerId: z.string().trim().min(1).max(64),
  amount: z.number().int().min(1).max(1_000_000),
});

export async function POST(req: Request) {
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: platformAdminAuthError(auth.status) }, { status: auth.status });
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
