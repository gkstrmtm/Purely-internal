import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).optional().nullable(),
});

const updateSchema = createSchema.extend({ id: z.string().trim().min(1).max(64) });

export async function GET() {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  try {
    const rows = await (prisma as any).portalTargetingBucket.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { members: true } },
      },
    });

    const buckets = (rows || []).map((b: any) => ({
      id: String(b.id),
      name: String(b.name),
      description: b.description == null ? null : String(b.description),
      membersCount: typeof b?._count?.members === "number" ? b._count.members : 0,
      createdAt: b.createdAt?.toISOString?.() ?? null,
      updatedAt: b.updatedAt?.toISOString?.() ?? null,
    }));

    return NextResponse.json({ ok: true, buckets });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load buckets." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const row = await (prisma as any).portalTargetingBucket.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: String(row.id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unable to create bucket.";
    return NextResponse.json({ ok: false, error: msg.includes("Unique constraint") ? "Bucket name already exists." : "Unable to create bucket." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await (prisma as any).portalTargetingBucket.update({
      where: { id: parsed.data.id },
      data: { name: parsed.data.name, description: parsed.data.description ?? null },
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to update bucket." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  try {
    await (prisma as any).portalTargetingBucket.delete({ where: { id }, select: { id: true } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to delete bucket." }, { status: 500 });
  }
}
