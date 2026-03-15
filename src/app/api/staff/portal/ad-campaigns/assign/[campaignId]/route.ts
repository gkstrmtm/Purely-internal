import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({ ownerId: z.string().trim().min(1).max(64) });

async function normalizeOwnerIdForAssignment(rawId: string): Promise<string> {
  const id = String(rawId || "").trim();
  if (!id) return id;

  // If a staff member accidentally assigns a *portal member* user id,
  // resolve it to the account owner id so it matches hosted page ownership.
  const member = await prisma.portalAccountMember
    .findFirst({ where: { userId: id }, select: { ownerId: true }, take: 1 })
    .catch(() => null);

  return member?.ownerId ? String(member.ownerId) : id;
}

export async function GET(_: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { campaignId } = await context.params;

  try {
    const rows = await prisma.portalAdCampaignAssignment.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        ownerId: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            businessProfile: { select: { businessName: true, industry: true, businessModel: true } },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, assignments: rows });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load assignments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { campaignId } = await context.params;

  const ownerId = await normalizeOwnerIdForAssignment(parsed.data.ownerId);

  try {
    await prisma.portalAdCampaignAssignment.upsert({
      where: { campaignId_ownerId: { campaignId, ownerId } },
      create: { campaignId, ownerId },
      update: {},
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to assign owner." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const ownerId = (url.searchParams.get("ownerId") ?? "").trim();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "ownerId is required" }, { status: 400 });
  }

  const { campaignId } = await context.params;

  try {
    await prisma.portalAdCampaignAssignment.delete({
      where: { campaignId_ownerId: { campaignId, ownerId } },
      select: { id: true },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to unassign owner." }, { status: 500 });
  }
}
