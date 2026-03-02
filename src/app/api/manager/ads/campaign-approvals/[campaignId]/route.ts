import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireManagerSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireManagerSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { campaignId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const reviewedById = String(auth.session.user.id);
  const reviewNotes = parsed.data.notes == null ? null : parsed.data.notes.trim() || null;

  const nextStatus = parsed.data.decision === "approve" ? "APPROVED" : "REJECTED";

  const updated = await prisma.portalAdCampaign.updateMany({
    where: { id: campaignId, reviewStatus: "PENDING" },
    data: {
      reviewStatus: nextStatus,
      reviewedAt: new Date(),
      reviewedById,
      reviewNotes,
    },
  });

  if (!updated.count) {
    return NextResponse.json({ ok: false, error: "Campaign not found (or already reviewed)." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
