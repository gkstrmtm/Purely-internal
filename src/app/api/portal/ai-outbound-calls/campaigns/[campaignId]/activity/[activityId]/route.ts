import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { listContactTagsForContact } from "@/lib/portalContactTags";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { refreshAiOutboundEnrollmentArtifacts } from "@/lib/portalAiOutboundEnrollmentArtifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);
const postSchema = z.object({ action: z.enum(["retry"]) }).strict();

async function getEnrollment(ownerId: string, campaignId: string, activityId: string) {
  const hasConversationId = await dbHasPublicColumn({
    tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"],
    columnName: "conversationId",
  }).catch(() => false);
  const hasRecordingSid = await dbHasPublicColumn({
    tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"],
    columnName: "recordingSid",
  }).catch(() => false);
  const hasTranscriptText = await dbHasPublicColumn({
    tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"],
    columnName: "transcriptText",
  }).catch(() => false);
  const hasBookingAnalysisJson = await dbHasPublicColumn({
    tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"],
    columnName: "bookingAnalysisJson",
  }).catch(() => false);

  return prisma.portalAiOutboundCallEnrollment.findFirst({
    where: { ownerId, campaignId, id: activityId },
    select: {
      id: true,
      ownerId: true,
      campaignId: true,
      contactId: true,
      status: true,
      attemptCount: true,
      lastError: true,
      callSid: true,
      ...(hasConversationId ? { conversationId: true } : {}),
      ...(hasRecordingSid ? { recordingSid: true } : {}),
      ...(hasTranscriptText ? { transcriptText: true } : {}),
      ...(hasBookingAnalysisJson ? { bookingAnalysisJson: true } : {}),
      nextCallAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
    } as any,
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ campaignId: string; activityId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  await ensurePortalAiOutboundCallsSchema();
  const params = await ctx.params;
  const campaignId = idSchema.safeParse(params.campaignId);
  const activityId = idSchema.safeParse(params.activityId);
  if (!campaignId.success || !activityId.success) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const enrollment = await getEnrollment(ownerId, campaignId.data, activityId.data);
  if (!enrollment) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const needsRefresh =
    (enrollment.status === "COMPLETED" || enrollment.status === "FAILED") &&
    (!String((enrollment as any).transcriptText || "").trim() ||
      (!String((enrollment as any).recordingSid || "").trim() && String(enrollment.callSid || "").trim()) ||
      (!((enrollment as any).bookingAnalysisJson && typeof (enrollment as any).bookingAnalysisJson === "object") &&
        String((enrollment as any).transcriptText || "").trim()));

  const effectiveEnrollment: any = needsRefresh
    ? ((await refreshAiOutboundEnrollmentArtifacts({ ownerId, enrollmentId: enrollment.id }).catch(() => null))?.enrollment ?? enrollment)
    : enrollment;

  const contactTags = await listContactTagsForContact(ownerId, effectiveEnrollment.contactId).catch(() => []);

  return NextResponse.json({
    ok: true,
    detail: {
      enrollmentId: effectiveEnrollment.id,
      status: effectiveEnrollment.status,
      attemptCount: effectiveEnrollment.attemptCount,
      lastError: effectiveEnrollment.lastError,
      callSid: effectiveEnrollment.callSid,
      nextCallAtIso: effectiveEnrollment.nextCallAt ? effectiveEnrollment.nextCallAt.toISOString() : null,
      completedAtIso: effectiveEnrollment.completedAt ? effectiveEnrollment.completedAt.toISOString() : null,
      createdAtIso: effectiveEnrollment.createdAt.toISOString(),
      updatedAtIso: effectiveEnrollment.updatedAt.toISOString(),
      contact: {
        id: effectiveEnrollment.contact.id,
        name: effectiveEnrollment.contact.name,
        phone: effectiveEnrollment.contact.phone,
        email: effectiveEnrollment.contact.email,
      },
      contactTags,
      transcriptText: String((effectiveEnrollment as any).transcriptText || "").trim() || null,
      transcriptSource: String((effectiveEnrollment as any).transcriptText || "").trim() ? "enrollment" : "none",
      transcriptUpdatedAtIso: String((effectiveEnrollment as any).transcriptText || "").trim() ? effectiveEnrollment.updatedAt.toISOString() : null,
      bookingAnalysis:
        (effectiveEnrollment as any).bookingAnalysisJson && typeof (effectiveEnrollment as any).bookingAnalysisJson === "object"
          ? (effectiveEnrollment as any).bookingAnalysisJson
          : null,
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string; activityId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  await ensurePortalAiOutboundCallsSchema();
  const params = await ctx.params;
  const campaignId = idSchema.safeParse(params.campaignId);
  const activityId = idSchema.safeParse(params.activityId);
  if (!campaignId.success || !activityId.success) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const enrollment = await getEnrollment(ownerId, campaignId.data, activityId.data);
  if (!enrollment) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const [hasConversationId, hasRecordingSid, hasTranscriptText, hasBookingAnalysisJson] = await Promise.all([
    dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"], columnName: "conversationId" }).catch(() => false),
    dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"], columnName: "recordingSid" }).catch(() => false),
    dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"], columnName: "transcriptText" }).catch(() => false),
    dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"], columnName: "bookingAnalysisJson" }).catch(() => false),
  ]);

  await prisma.portalAiOutboundCallEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "QUEUED",
      nextCallAt: new Date(),
      completedAt: null,
      lastError: null,
      callSid: null,
      ...(hasConversationId ? { conversationId: null } : {}),
      ...(hasRecordingSid ? { recordingSid: null } : {}),
      ...(hasTranscriptText ? { transcriptText: null } : {}),
      ...(hasBookingAnalysisJson ? { bookingAnalysisJson: null } : {}),
    } as any,
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ campaignId: string; activityId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  await ensurePortalAiOutboundCallsSchema();
  const params = await ctx.params;
  const campaignId = idSchema.safeParse(params.campaignId);
  const activityId = idSchema.safeParse(params.activityId);
  if (!campaignId.success || !activityId.success) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const enrollment = await getEnrollment(ownerId, campaignId.data, activityId.data);
  if (!enrollment) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await prisma.portalAiOutboundCallEnrollment.delete({ where: { id: enrollment.id }, select: { id: true } });
  return NextResponse.json({ ok: true });
}
