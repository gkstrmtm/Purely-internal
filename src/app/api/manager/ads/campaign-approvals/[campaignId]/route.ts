import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireManagerSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reason: z
      .enum([
        "MISLEADING_OR_FALSE",
        "INAPPROPRIATE_CONTENT",
        "PROHIBITED_PRODUCTS",
        "SPAM_OR_LOW_QUALITY",
        "BROKEN_OR_MISMATCHED_LINK",
      ])
      .optional()
      .nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.decision === "reject" && !val.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Reason is required when rejecting.", path: ["reason"] });
    }
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
  const notesTrimmed = parsed.data.notes == null ? null : parsed.data.notes.trim() || null;

  const reason = parsed.data.reason ?? null;
  const reasonLabel =
    reason === "MISLEADING_OR_FALSE"
      ? "Misleading or false"
      : reason === "INAPPROPRIATE_CONTENT"
        ? "Inappropriate content"
        : reason === "PROHIBITED_PRODUCTS"
          ? "Prohibited products/services"
          : reason === "SPAM_OR_LOW_QUALITY"
            ? "Spam / low quality"
            : reason === "BROKEN_OR_MISMATCHED_LINK"
              ? "Broken or mismatched link"
              : null;

  const reviewNotes =
    parsed.data.decision === "reject"
      ? [
          reason ? `[REASON:${reason}] ${reasonLabel ?? reason}` : null,
          notesTrimmed ? `Notes: ${notesTrimmed}` : null,
        ]
          .filter(Boolean)
          .join("\n") || null
      : notesTrimmed;

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
