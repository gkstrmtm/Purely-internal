import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FEEDBACK_TRIAGE_PRIORITY_VALUES,
  FEEDBACK_TRIAGE_STATUS_VALUES,
  PORTAL_FEEDBACK_SETUP_SLUG,
  updatePortalFeedbackItemTriage,
} from "@/lib/betaFeedback";
import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    ownerId: z.string().trim().min(1).max(64),
    itemId: z.string().trim().min(1).max(120),
    status: z.enum(FEEDBACK_TRIAGE_STATUS_VALUES).optional(),
    priority: z.enum(FEEDBACK_TRIAGE_PRIORITY_VALUES).optional(),
    backlogRef: z.string().trim().max(200).optional(),
    promptRef: z.string().trim().max(200).optional(),
    exportBucket: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.portalServiceSetup.findUnique({
    where: {
      ownerId_serviceSlug: {
        ownerId: parsed.data.ownerId,
        serviceSlug: PORTAL_FEEDBACK_SETUP_SLUG,
      },
    },
    select: { dataJson: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Feedback store not found" }, { status: 404 });
  }

  const reviewedAtIso = new Date().toISOString();
  const { payload, item } = updatePortalFeedbackItemTriage(existing.dataJson, parsed.data.itemId, {
    status: parsed.data.status,
    priority: parsed.data.priority,
    backlogRef: parsed.data.backlogRef,
    promptRef: parsed.data.promptRef,
    exportBucket: parsed.data.exportBucket,
    notes: parsed.data.notes,
    reviewerEmail: auth.session.user.email ?? undefined,
    lastReviewedAtIso: reviewedAtIso,
  });

  if (!item) {
    return NextResponse.json({ error: "Feedback item not found" }, { status: 404 });
  }

  await prisma.portalServiceSetup.upsert({
    where: {
      ownerId_serviceSlug: {
        ownerId: parsed.data.ownerId,
        serviceSlug: PORTAL_FEEDBACK_SETUP_SLUG,
      },
    },
    create: {
      ownerId: parsed.data.ownerId,
      serviceSlug: PORTAL_FEEDBACK_SETUP_SLUG,
      status: "COMPLETE",
      dataJson: payload as any,
    },
    update: {
      status: "COMPLETE",
      dataJson: payload as any,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, item });
}