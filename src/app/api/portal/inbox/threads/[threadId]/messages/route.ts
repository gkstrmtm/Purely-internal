import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";
import { normalizePhoneForStorage } from "@/lib/phone";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIsoMillis(value: unknown): number | null {
  const raw = value instanceof Date ? value.toISOString() : String(value || "").trim();
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

function pickClosestOutboundMessageId(
  messages: Array<{ id: string; direction: string; createdAt: string }>,
  targetAt: unknown,
  usedIds: Set<string>,
): string | null {
  const targetMs = parseIsoMillis(targetAt);
  if (targetMs === null) return null;

  let bestId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const message of messages) {
    if (message.direction !== "OUT" || usedIds.has(message.id)) continue;
    const createdMs = parseIsoMillis(message.createdAt);
    if (createdMs === null) continue;
    const score = Math.abs(createdMs - targetMs);
    if (score < bestScore) {
      bestScore = score;
      bestId = message.id;
    }
  }

  if (bestId && bestScore <= 20 * 60 * 1000) {
    usedIds.add(bestId);
    return bestId;
  }

  return null;
}

function customerFriendlyError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();

  if (msg.includes("portalinbox") && (msg.includes("does not exist") || msg.includes("relation") || msg.includes("table"))) {
    return {
      status: 503,
      code: "INBOX_NOT_READY",
      error:
        "Your inbox is still being set up. Please refresh in a minute. If this keeps happening, contact support.",
    };
  }

  return {
    status: 500,
    code: "INBOX_LOAD_FAILED",
    error: "We couldn’t load this conversation right now. Please try again in a moment.",
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const { threadId } = await params;

  try {
    // Best-effort background schema installer (safe if already installed).
    // IMPORTANT: Don't block message loading on DDL / schema checks.
    void ensurePortalInboxSchema().catch(() => undefined);
    void ensurePortalAiOutboundCallsSchema().catch(() => undefined);

    const thread = await (prisma as any).portalInboxThread.findFirst({
      where: { id: threadId, ownerId },
      select: { id: true, channel: true, contactId: true, peerAddress: true },
    });
    if (!thread) return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });

    const url = new URL(req.url);
    const takeRaw = Number(url.searchParams.get("take") ?? "120");
    const take = Number.isFinite(takeRaw) ? Math.max(10, Math.min(500, takeRaw)) : 120;

    const messageSelectBase = {
      id: true,
      channel: true,
      direction: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      bodyText: true,
      provider: true,
      providerMessageId: true,
      createdAt: true,
    } as const;

    let messages: any[] = [];
    try {
      messages = await (prisma as any).portalInboxMessage.findMany({
        where: { ownerId, threadId },
        orderBy: { createdAt: "asc" },
        take,
        select: {
          ...messageSelectBase,
          attachments: {
            select: { id: true, fileName: true, mimeType: true, fileSize: true, publicToken: true },
          },
        },
      });
    } catch (err) {
      // If the "full" query fails (timeouts, transient DB errors, etc.),
      // retry with a lighter payload so the conversation can still render.
      console.error("[inbox/messages] load failed; retrying without attachments", {
        ownerId,
        threadId,
        take,
        err: err instanceof Error ? err.message : String(err ?? ""),
      });

      const fallbackTake = Math.min(120, take);
      messages = await (prisma as any).portalInboxMessage.findMany({
        where: { ownerId, threadId },
        orderBy: { createdAt: "asc" },
        take: fallbackTake,
        select: messageSelectBase,
      });
    }

    // Best-effort dedupe: historically, outbound SMS could be logged twice
    // (Twilio send helper + API route). Collapse by provider message id.
    const deduped: any[] = [];
    const seen = new Map<string, number>();
    for (const m of messages ?? []) {
      const provider = typeof m?.provider === "string" ? m.provider : "";
      const providerMessageId = typeof m?.providerMessageId === "string" ? m.providerMessageId : "";
      const key = provider && providerMessageId ? `${provider}:${providerMessageId}` : "";
      if (!key) {
        deduped.push(m);
        continue;
      }

      const idx = seen.get(key);
      if (idx === undefined) {
        seen.set(key, deduped.length);
        deduped.push(m);
        continue;
      }

      const existing = deduped[idx];
      const existingAtt = Array.isArray(existing?.attachments) ? existing.attachments.length : 0;
      const nextAtt = Array.isArray(m?.attachments) ? m.attachments.length : 0;
      const existingBody = String(existing?.bodyText ?? "").trim();
      const nextBody = String(m?.bodyText ?? "").trim();

      // Prefer the row that has attachments and/or a non-empty body.
      if (nextAtt > existingAtt || (!existingBody && nextBody)) {
        deduped[idx] = m;
      }
    }

    const withUrls = deduped.map((m: any) => ({
      ...m,
      attachments: Array.isArray(m.attachments)
        ? m.attachments.map((a: any) => ({
            id: a.id,
            fileName: a.fileName,
            mimeType: a.mimeType,
            fileSize: a.fileSize,
            url: `/api/public/inbox/attachment/${a.id}/${a.publicToken}`,
          }))
        : [],
    }));

    const aiOutboundBadgeByMessageId = new Map<string, { campaignId: string; campaignName: string }>();
    const callEvents: Array<{
      id: string;
      kind: "campaign" | "manual";
      campaignId: string | null;
      campaignName: string | null;
      status: string;
      createdAt: string;
      completedAt: string | null;
      transcriptText: string | null;
      recordingSid: string | null;
      recordingDurationSec: number | null;
      phoneNumber: string | null;
      sourceLabel: string;
    }> = [];

    try {
      const [hasMessageThreadId, hasMessageSentFirstMessageAt, hasMessageLastAutoReplyAt] = await Promise.all([
        dbHasPublicColumn({ tableNames: ["PortalAiOutboundMessageEnrollment", "portalaioutboundmessageenrollment"], columnName: "threadId" }).catch(() => false),
        dbHasPublicColumn({ tableNames: ["PortalAiOutboundMessageEnrollment", "portalaioutboundmessageenrollment"], columnName: "sentFirstMessageAt" }).catch(() => false),
        dbHasPublicColumn({ tableNames: ["PortalAiOutboundMessageEnrollment", "portalaioutboundmessageenrollment"], columnName: "lastAutoReplyAt" }).catch(() => false),
      ]);

      if (hasMessageThreadId) {
        const messageEnrollments = await prisma.portalAiOutboundMessageEnrollment.findMany({
          where: { ownerId, threadId },
          select: {
            id: true,
            campaignId: true,
            ...(hasMessageSentFirstMessageAt ? { sentFirstMessageAt: true } : {}),
            ...(hasMessageLastAutoReplyAt ? { lastAutoReplyAt: true } : {}),
            campaign: { select: { id: true, name: true } },
          },
          orderBy: [{ updatedAt: "asc" }],
          take: 20,
        });

        const usedMessageIds = new Set<string>();
        for (const enrollment of messageEnrollments) {
          const campaignId = String(enrollment.campaignId || enrollment.campaign?.id || "").trim();
          const campaignName = String(enrollment.campaign?.name || "AI outbound campaign").trim() || "AI outbound campaign";
          if (!campaignId) continue;

          const messageIds = [
            pickClosestOutboundMessageId(withUrls, (enrollment as any).sentFirstMessageAt, usedMessageIds),
            pickClosestOutboundMessageId(withUrls, (enrollment as any).lastAutoReplyAt, usedMessageIds),
          ].filter(Boolean) as string[];

          if (!messageIds.length) {
            const fallback = withUrls.find((message: any) => message.direction === "OUT");
            if (fallback?.id && !usedMessageIds.has(String(fallback.id))) {
              usedMessageIds.add(String(fallback.id));
              messageIds.push(String(fallback.id));
            }
          }

          for (const messageId of messageIds) {
            if (!aiOutboundBadgeByMessageId.has(messageId)) {
              aiOutboundBadgeByMessageId.set(messageId, { campaignId, campaignName });
            }
          }
        }
      }

      if (thread.channel === "SMS") {
        const normalizedPeer = normalizePhoneForStorage(String(thread.peerAddress || ""));
        const [hasCallTranscriptText, hasCallRecordingSid, hasCallCompletedAt, hasManualTranscriptText, hasManualRecordingSid, hasManualRecordingDurationSec] = await Promise.all([
          dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"], columnName: "transcriptText" }).catch(() => false),
          dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"], columnName: "recordingSid" }).catch(() => false),
          dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallEnrollment", "portalaioutboundcallenrollment"], columnName: "completedAt" }).catch(() => false),
          dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallManualCall", "portalaioutboundcallmanualcall"], columnName: "transcriptText" }).catch(() => false),
          dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallManualCall", "portalaioutboundcallmanualcall"], columnName: "recordingSid" }).catch(() => false),
          dbHasPublicColumn({ tableNames: ["PortalAiOutboundCallManualCall", "portalaioutboundcallmanualcall"], columnName: "recordingDurationSec" }).catch(() => false),
        ]);

        if (thread.contactId) {
          const callEnrollments = await prisma.portalAiOutboundCallEnrollment.findMany({
            where: { ownerId, contactId: String(thread.contactId) },
            select: {
              id: true,
              campaignId: true,
              status: true,
              createdAt: true,
              ...(hasCallCompletedAt ? { completedAt: true } : {}),
              ...(hasCallTranscriptText ? { transcriptText: true } : {}),
              ...(hasCallRecordingSid ? { recordingSid: true } : {}),
              campaign: { select: { id: true, name: true } },
            },
            orderBy: [{ createdAt: "asc" }],
            take: 25,
          });

          for (const row of callEnrollments) {
            callEvents.push({
              id: `campaign:${row.id}`,
              kind: "campaign",
              campaignId: String(row.campaignId || row.campaign?.id || "").trim() || null,
              campaignName: String(row.campaign?.name || "").trim() || null,
              status: String(row.status || "UNKNOWN").trim() || "UNKNOWN",
              createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
              completedAt:
                (row as any).completedAt instanceof Date
                  ? (row as any).completedAt.toISOString()
                  : String((row as any).completedAt || "").trim() || null,
              transcriptText: String((row as any).transcriptText || "").trim() || null,
              recordingSid: String((row as any).recordingSid || "").trim() || null,
              recordingDurationSec: null,
              phoneNumber: normalizedPeer || null,
              sourceLabel: "AI outbound call",
            });
          }
        }

        if (normalizedPeer) {
          const manualCalls = await prisma.portalAiOutboundCallManualCall.findMany({
            where: { ownerId, toNumberE164: normalizedPeer },
            select: {
              id: true,
              campaignId: true,
              status: true,
              toNumberE164: true,
              createdAt: true,
              ...(hasManualTranscriptText ? { transcriptText: true } : {}),
              ...(hasManualRecordingSid ? { recordingSid: true } : {}),
              ...(hasManualRecordingDurationSec ? { recordingDurationSec: true } : {}),
              campaign: { select: { id: true, name: true } },
            },
            orderBy: [{ createdAt: "asc" }],
            take: 20,
          });

          for (const row of manualCalls) {
            callEvents.push({
              id: `manual:${row.id}`,
              kind: "manual",
              campaignId: String(row.campaignId || row.campaign?.id || "").trim() || null,
              campaignName: String(row.campaign?.name || "").trim() || null,
              status: String(row.status || "UNKNOWN").trim() || "UNKNOWN",
              createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
              completedAt: null,
              transcriptText: String((row as any).transcriptText || "").trim() || null,
              recordingSid: String((row as any).recordingSid || "").trim() || null,
              recordingDurationSec:
                typeof (row as any).recordingDurationSec === "number" && Number.isFinite((row as any).recordingDurationSec)
                  ? Number((row as any).recordingDurationSec)
                  : null,
              phoneNumber: String(row.toNumberE164 || "").trim() || null,
              sourceLabel: "AI outbound call",
            });
          }
        }
      }
    } catch (err) {
      console.error("[inbox/messages] ai outbound enrichment failed", {
        ownerId,
        threadId,
        err: err instanceof Error ? err.message : String(err ?? ""),
      });
    }

    let scheduledMessages: any[] = [];
    try {
      const scheduledRows = (await (prisma as any).portalInboxScheduledMessage
        .findMany({
          where: { ownerId, threadId, status: { in: ["PENDING", "SENDING"] } },
          orderBy: { scheduledFor: "asc" },
          take: 50,
          select: {
            id: true,
            channel: true,
            toAddress: true,
            subject: true,
            bodyText: true,
            attachmentIds: true,
            scheduledFor: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        .catch(() => [])) as any[];

      const scheduledAttachmentIds = Array.from(
        new Set(
          scheduledRows
            .flatMap((r: any) => (Array.isArray(r?.attachmentIds) ? r.attachmentIds : []))
            .map((x: any) => String(x || "").trim())
            .filter(Boolean),
        ),
      ).slice(0, 250);

      const scheduledAttachments = scheduledAttachmentIds.length
        ? (((await (prisma as any).portalInboxAttachment
            .findMany({
              where: { ownerId, id: { in: scheduledAttachmentIds }, messageId: null },
              select: { id: true, fileName: true, mimeType: true, fileSize: true, publicToken: true },
            })
            .catch(() => [])) as any[]) ?? [])
        : ([] as any[]);

      const scheduledAttachmentById = new Map<string, any>();
      for (const a of scheduledAttachments) {
        const id = String(a?.id || "").trim();
        if (id) scheduledAttachmentById.set(id, a);
      }

      scheduledMessages = scheduledRows.map((r: any) => {
        const attachmentIds = Array.isArray(r?.attachmentIds)
          ? r.attachmentIds.map((x: any) => String(x || "").trim()).filter(Boolean)
          : [];

        const attachments = attachmentIds
          .map((id: string) => scheduledAttachmentById.get(id))
          .filter(Boolean)
          .map((a: any) => ({
            id: a.id,
            fileName: a.fileName,
            mimeType: a.mimeType,
            fileSize: a.fileSize,
            url: `/api/public/inbox/attachment/${a.id}/${a.publicToken}`,
          }));

        return {
          id: String(r?.id || ""),
          channel: r?.channel,
          toAddress: String(r?.toAddress || ""),
          subject: r?.subject ?? null,
          bodyText: String(r?.bodyText || ""),
          scheduledFor: r?.scheduledFor instanceof Date ? r.scheduledFor.toISOString() : String(r?.scheduledFor || ""),
          status: r?.status,
          createdAt: r?.createdAt instanceof Date ? r.createdAt.toISOString() : String(r?.createdAt || ""),
          updatedAt: r?.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r?.updatedAt || ""),
          attachments,
        };
      });
    } catch (err) {
      console.error("[inbox/messages] scheduled enrichment failed", {
        ownerId,
        threadId,
        err: err instanceof Error ? err.message : String(err ?? ""),
      });
      scheduledMessages = [];
    }

    return NextResponse.json({
      ok: true,
      messages: withUrls.map((message: any) => ({
        ...message,
        aiOutboundCampaign: aiOutboundBadgeByMessageId.get(String(message.id || "")) ?? null,
      })),
      scheduledMessages,
      callEvents: callEvents.sort((a, b) => {
        const aAt = parseIsoMillis(a.completedAt || a.createdAt) ?? 0;
        const bAt = parseIsoMillis(b.completedAt || b.createdAt) ?? 0;
        return aAt - bAt;
      }),
    });
  } catch (e) {
    const friendly = customerFriendlyError(e);
    return NextResponse.json({ ok: false, code: friendly.code, error: friendly.error }, { status: friendly.status });
  }
}
