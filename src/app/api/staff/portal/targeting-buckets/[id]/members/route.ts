import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const addSchema = z.object({
  ownerIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { id } = await ctx.params;
  const bucketId = String(id || "").trim();
  if (!bucketId) return NextResponse.json({ ok: false, error: "Missing bucket id" }, { status: 400 });

  try {
    const rows = await (prisma as any).portalTargetingBucketMember.findMany({
      where: { bucketId },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
      select: {
        id: true,
        ownerId: true,
        createdAt: true,
        owner: { select: { id: true, email: true, name: true, businessProfile: { select: { businessName: true } } } },
      },
    });

    const members = (rows || []).map((m: any) => ({
      id: String(m.id),
      ownerId: String(m.ownerId),
      email: String(m?.owner?.email || ""),
      name: String(m?.owner?.name || ""),
      businessName: String(m?.owner?.businessProfile?.businessName || ""),
      createdAt: m.createdAt?.toISOString?.() ?? null,
    }));

    return NextResponse.json({ ok: true, members });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load members." }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { id } = await ctx.params;
  const bucketId = String(id || "").trim();
  if (!bucketId) return NextResponse.json({ ok: false, error: "Missing bucket id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = addSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    for (const ownerId of parsed.data.ownerIds) {
      await (prisma as any).portalTargetingBucketMember.upsert({
        where: { bucketId_ownerId: { bucketId, ownerId } },
        create: { bucketId, ownerId },
        update: {},
        select: { id: true },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to add members." }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { id } = await ctx.params;
  const bucketId = String(id || "").trim();
  if (!bucketId) return NextResponse.json({ ok: false, error: "Missing bucket id" }, { status: 400 });

  const url = new URL(req.url);
  const ownerId = (url.searchParams.get("ownerId") || "").trim();
  if (!ownerId) return NextResponse.json({ ok: false, error: "Missing ownerId" }, { status: 400 });

  try {
    await (prisma as any).portalTargetingBucketMember.delete({
      where: { bucketId_ownerId: { bucketId, ownerId } },
      select: { id: true },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to remove member." }, { status: 500 });
  }
}
