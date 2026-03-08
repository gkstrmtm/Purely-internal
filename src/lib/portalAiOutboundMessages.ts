import crypto from "crypto";

import { prisma } from "@/lib/db";
import { normalizeTagIdList } from "@/lib/portalAiOutboundCalls";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { listContactTagsForContact } from "@/lib/portalContactTags";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { recordPortalContactServiceTrigger } from "@/lib/portalContactServiceTriggers";

type MessageEnrollmentChannelPolicy = "SMS" | "EMAIL" | "BOTH";
type MessageEnrollmentSource = "TAG" | "MANUAL" | "INBOUND";

export async function enqueueOutboundMessageForContact(opts: {
  ownerId: string;
  contactId: string;
  campaignId?: string;
  channelPolicy?: MessageEnrollmentChannelPolicy;
  source?: MessageEnrollmentSource;
}): Promise<
  | { ok: true; enrollmentId?: string; activatedCampaign?: boolean }
  | { ok: false; error: string }
> {
  const ownerId = String(opts.ownerId || "").trim();
  const contactId = String(opts.contactId || "").trim();
  const campaignIdRaw = String(opts.campaignId || "").trim();
  if (!ownerId || !contactId) return { ok: false, error: "Missing owner/contact" };

  await ensurePortalAiOutboundCallsSchema();

  const campaign = campaignIdRaw
    ? await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId, id: campaignIdRaw },
        select: { id: true, status: true, messageChannelPolicy: true },
      })
    : await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId, status: "ACTIVE" },
        select: { id: true, status: true, messageChannelPolicy: true },
        orderBy: [{ updatedAt: "desc" }],
      });

  if (!campaign?.id) return { ok: false, error: "No campaign found" };
  if (campaign.status === "ARCHIVED") return { ok: false, error: "Campaign is archived" };

  const now = new Date();
  let activatedCampaign = false;
  if (campaign.status !== "ACTIVE") {
    activatedCampaign = true;
    await prisma.portalAiOutboundCallCampaign
      .update({ where: { id: campaign.id }, data: { status: "ACTIVE", updatedAt: now }, select: { id: true } })
      .catch(() => null);
  }

  const channelPolicy = (opts.channelPolicy || (campaign as any).messageChannelPolicy || "BOTH") as MessageEnrollmentChannelPolicy;
  const source = (opts.source || "MANUAL") as MessageEnrollmentSource;

  const existing = await prisma.portalAiOutboundMessageEnrollment
    .findUnique({
      where: { campaignId_contactId: { campaignId: campaign.id, contactId } },
      select: { id: true, sentFirstMessageAt: true },
    })
    .catch(() => null);

  if (existing?.id && existing.sentFirstMessageAt) {
    await prisma.portalAiOutboundMessageEnrollment
      .update({
        where: { id: existing.id },
        data: { status: "ACTIVE", source, channelPolicy, lastError: null },
        select: { id: true },
      })
      .catch(() => null);

    await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);
    return { ok: true, enrollmentId: existing.id, activatedCampaign };
  }

  const id = crypto.randomUUID();
  await prisma.portalAiOutboundMessageEnrollment
    .upsert({
      where: { campaignId_contactId: { campaignId: campaign.id, contactId } },
      create: {
        id,
        ownerId,
        campaignId: campaign.id,
        contactId,
        status: "QUEUED",
        source,
        channelPolicy,
        nextSendAt: now,
        sentFirstMessageAt: null,
        threadId: null,
        attemptCount: 0,
        lastError: null,
        pendingReplyToMessageId: null,
        nextReplyAt: null,
        replyAttemptCount: 0,
        replyLastError: null,
        lastAutoRepliedMessageId: null,
        lastAutoReplyAt: null,
        updatedAt: now,
        createdAt: now,
      },
      update: {
        status: "QUEUED",
        source,
        channelPolicy,
        nextSendAt: now,
        attemptCount: 0,
        lastError: null,
        updatedAt: now,
      },
      select: { id: true },
    })
    .catch((e) => {
      throw e;
    });

  await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);
  return { ok: true, enrollmentId: id, activatedCampaign };
}

export async function enqueueOutboundMessageForTaggedContact(opts: {
  ownerId: string;
  contactId: string;
  tagId: string;
}): Promise<{ ok: true; enqueued: number } | { ok: false; error: string }> {
  const ownerId = String(opts.ownerId || "").trim();
  const contactId = String(opts.contactId || "").trim();
  const tagId = String(opts.tagId || "").trim();
  if (!ownerId || !contactId || !tagId) return { ok: true, enqueued: 0 };

  await ensurePortalAiOutboundCallsSchema();

  const campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
    where: { ownerId, status: "ACTIVE" },
    select: { id: true, chatAudienceTagIdsJson: true, messageChannelPolicy: true },
    take: 200,
  });

  const matched = campaigns.filter((c) => {
    const tags = normalizeTagIdList(c.chatAudienceTagIdsJson);
    return tags.includes(tagId);
  });

  if (!matched.length) return { ok: true, enqueued: 0 };

  const now = new Date();
  let enqueued = 0;

  for (const c of matched) {
    try {
      await prisma.portalAiOutboundMessageEnrollment.create({
        data: {
          id: crypto.randomUUID(),
          ownerId,
          campaignId: c.id,
          contactId,
          status: "QUEUED",
          source: "TAG",
          channelPolicy: (c as any).messageChannelPolicy || "BOTH",
          nextSendAt: now,
          sentFirstMessageAt: null,
          threadId: null,
          attemptCount: 0,
          lastError: null,
          pendingReplyToMessageId: null,
          nextReplyAt: null,
          replyAttemptCount: 0,
          replyLastError: null,
          lastAutoRepliedMessageId: null,
          lastAutoReplyAt: null,
          updatedAt: now,
          createdAt: now,
        },
        select: { id: true },
      });
      enqueued += 1;
    } catch (e: any) {
      const code = typeof e?.code === "string" ? e.code : "";
      if (code === "P2002") continue;
      continue;
    }
  }

  if (enqueued > 0) {
    await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);
  }

  return { ok: true, enqueued };
}

export async function queueAiOutboundMessageRepliesForInboundMessage(opts: {
  ownerId: string;
  threadId: string;
  messageId: string;
}): Promise<{ ok: true; queued: number }> {
  const ownerId = String(opts.ownerId || "").trim();
  const threadId = String(opts.threadId || "").trim();
  const messageId = String(opts.messageId || "").trim();
  if (!ownerId || !threadId || !messageId) return { ok: true, queued: 0 };

  // Avoid runtime failures if migrations haven't been applied yet.
  await ensurePortalInboxSchema();
  await ensurePortalAiOutboundCallsSchema();

  const thread = await (prisma as any).portalInboxThread
    .findFirst({
      where: { ownerId, id: threadId },
      select: { id: true, channel: true, contactId: true },
    })
    .catch(() => null);

  const contactId = thread?.contactId ? String(thread.contactId) : "";
  if (!contactId) return { ok: true, queued: 0 };

  const msg = await (prisma as any).portalInboxMessage
    .findFirst({
      where: { ownerId, id: messageId, threadId, direction: "IN" },
      select: { id: true },
    })
    .catch(() => null);

  if (!msg?.id) return { ok: true, queued: 0 };

  const tags = await listContactTagsForContact(ownerId, contactId).catch(() => []);
  const tagIds = Array.from(new Set(tags.map((t) => String(t.id)).filter(Boolean)));
  if (!tagIds.length) return { ok: true, queued: 0 };

  const campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
    where: { ownerId, status: "ACTIVE" },
    select: { id: true, updatedAt: true, chatAudienceTagIdsJson: true, messageChannelPolicy: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });

  const threadChannel = String(thread?.channel || "").toUpperCase() === "SMS" ? "SMS" : "EMAIL";

  const matched = campaigns.filter((c) => {
    const audience = normalizeTagIdList(c.chatAudienceTagIdsJson);
    if (!audience.some((id) => tagIds.includes(id))) return false;

    const policy = String((c as any).messageChannelPolicy || "BOTH").toUpperCase();
    if (policy === "SMS") return threadChannel === "SMS";
    if (policy === "EMAIL") return threadChannel === "EMAIL";
    return true;
  });

  if (!matched.length) return { ok: true, queued: 0 };

  const now = new Date();
  const replyAt = new Date(now.getTime() + 15 * 1000);

  let queued = 0;
  for (const c of matched.slice(0, 3)) {
    try {
      await prisma.portalAiOutboundMessageEnrollment.upsert({
        where: { campaignId_contactId: { campaignId: c.id, contactId } },
        create: {
          id: crypto.randomUUID(),
          ownerId,
          campaignId: c.id,
          contactId,
          status: "ACTIVE",
          source: "INBOUND",
          channelPolicy: threadChannel,
          nextSendAt: null,
          sentFirstMessageAt: null,
          threadId,
          attemptCount: 0,
          lastError: null,
          pendingReplyToMessageId: messageId,
          nextReplyAt: replyAt,
          replyAttemptCount: 0,
          replyLastError: null,
          lastAutoRepliedMessageId: null,
          lastAutoReplyAt: null,
          updatedAt: now,
          createdAt: now,
        },
        update: {
          status: "ACTIVE",
          threadId,
          pendingReplyToMessageId: messageId,
          nextReplyAt: replyAt,
        },
        select: { id: true },
      });
      queued += 1;
    } catch {
      // best-effort
    }
  }

  if (queued > 0) {
    await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);
  }

  return { ok: true, queued };
}
