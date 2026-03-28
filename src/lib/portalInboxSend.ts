import { randomUUID } from "crypto";

import { prisma } from "@/lib/db";
import { recordThresholdMeterUsage } from "@/lib/creditsMetering";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { getOwnerTwilioSmsConfig, sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { sendEmail } from "@/lib/leadOutbound";
import {
  getOutboundEmailFrom,
  getOutboundEmailProvider,
  isOutboundEmailConfigured,
  missingOutboundEmailConfigReason,
} from "@/lib/emailSender";
import { getOrCreateOwnerMailboxAddress } from "@/lib/portalMailbox";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";
import {
  makeEmailThreadKey,
  makeSmsThreadKey,
  normalizeSmsPeerKey,
  normalizeSubjectKey,
  upsertPortalInboxMessage,
} from "@/lib/portalInbox";

export type PortalInboxChannel = "email" | "sms";

export type SendPortalInboxMessageInput = {
  ownerId: string;
  channel: PortalInboxChannel;
  to: string;
  subject?: string;
  body?: string;
  attachmentIds?: string[];
  threadId?: string;
  baseUrl?: string;
};

export type SendPortalInboxMessageResult =
  | { ok: true; threadId: string | null }
  | { ok: false; error: string };

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x)).filter(Boolean);
}

export async function sendPortalInboxMessageNow(input: SendPortalInboxMessageInput): Promise<SendPortalInboxMessageResult> {
  const ownerId = String(input.ownerId || "").trim();
  if (!ownerId) return { ok: false, error: "Missing owner" };

  const channel = input.channel;
  if (channel !== "email" && channel !== "sms") return { ok: false, error: "Invalid channel" };

  // Avoid runtime failures if migrations haven't been applied yet.
  await ensurePortalInboxSchema();

  const bodyInput = String(input.body ?? "");
  const toRaw = String(input.to ?? "").trim();
  const attachmentIds = asStringArray(input.attachmentIds).slice(0, 10);

  if (!String(bodyInput || "").trim() && attachmentIds.length === 0) {
    return { ok: false, error: "Message or attachment is required" };
  }

  const attachments = attachmentIds.length
    ? await (prisma as any).portalInboxAttachment.findMany({
        where: { ownerId, id: { in: attachmentIds }, messageId: null },
        select: { id: true, fileName: true, mimeType: true, fileSize: true, bytes: true, publicToken: true },
      })
    : [];

  if (attachmentIds.length && attachments.length !== attachmentIds.length) {
    return { ok: false, error: "One or more attachments are missing." };
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });

  const ownerUser = await prisma.user
    .findUnique({ where: { id: ownerId }, select: { email: true, name: true } })
    .catch(() => null);
  const ownerEmail = ownerUser?.email?.trim() || null;
  const ownerName = ownerUser?.name?.trim() || null;

  const ownerPhone = await (async () => {
    try {
      const row = await prisma.portalServiceSetup.findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "profile" } },
        select: { dataJson: true },
      });

      const rec =
        row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
          ? (row.dataJson as Record<string, unknown>)
          : null;
      const raw = rec?.phone;
      return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 32) : null;
    } catch {
      return null;
    }
  })();

  const existingThread = input.threadId
    ? await (prisma as any).portalInboxThread.findFirst({
        where: { id: String(input.threadId), ownerId },
        select: {
          id: true,
          channel: true,
          threadKey: true,
          peerAddress: true,
          peerKey: true,
          subject: true,
          subjectKey: true,
          contactId: true,
        },
      })
    : null;

  const contactRow = existingThread?.contactId
    ? await (prisma as any).portalContact
        .findFirst({
          where: { ownerId, id: String(existingThread.contactId) },
          select: { id: true, name: true, email: true, phone: true, customVariables: true },
        })
        .catch(() => null)
    : null;

  const contactTags = contactRow?.id
    ? await (prisma as any).portalContactTagAssignment
        .findMany({
          where: { ownerId, contactId: String(contactRow.id) },
          take: 200,
          select: { tag: { select: { name: true } } },
        })
        .then((rows: any[]) =>
          (rows || [])
            .map((r) => String(r?.tag?.name || "").trim())
            .filter(Boolean)
            .slice(0, 50),
        )
        .catch(() => [] as string[])
    : ([] as string[]);

  const templateVars = buildPortalTemplateVars({
    contact: {
      id: contactRow?.id ? String(contactRow.id) : null,
      name: contactRow?.name ? String(contactRow.name) : null,
      email: contactRow?.email ? String(contactRow.email) : null,
      phone: contactRow?.phone ? String(contactRow.phone) : null,
      tags: contactTags,
      customVariables:
        contactRow?.customVariables && typeof contactRow.customVariables === "object" && !Array.isArray(contactRow.customVariables)
          ? (contactRow.customVariables as Record<string, string>)
          : null,
    },
    business: { name: profile?.businessName?.trim() || "Purely Automation" },
    owner: { name: ownerName, email: ownerEmail, phone: ownerPhone },
    message: { body: bodyInput },
  });

  const body = renderTextTemplate(bodyInput, templateVars).trim();

  const fallbackBodyText =
    body ||
    (attachments.length === 1
      ? `[Attachment] ${String(attachments[0].fileName ?? "").trim() || "file"}`
      : attachments.length > 1
        ? `[${attachments.length} attachments]`
        : "");

  if (channel === "sms") {
    const peer = normalizeSmsPeerKey(toRaw);
    if (peer.error) return { ok: false, error: peer.error };
    if (!peer.peer || !peer.peerKey) return { ok: false, error: "Invalid phone" };

    const metered = await recordThresholdMeterUsage({
      ownerId,
      spec: {
        meterKey: "inbox_messages_v1",
        unitSize: PORTAL_CREDIT_COSTS.inboxMessagesPerUnit,
        creditsPerUnit: PORTAL_CREDIT_COSTS.inboxCreditsPerUnit,
      },
      increment: 1,
      note: "inbox_send_sms",
    });
    if (!metered.ok) {
      return { ok: false, error: metered.error };
    }

    const twilioCfg = await getOwnerTwilioSmsConfig(ownerId);

    const baseUrl = String(input.baseUrl || "").trim();
    if (attachments.length && !baseUrl) {
      return { ok: false, error: "Missing base URL for SMS attachments" };
    }

    const mediaUrls = attachments.length
      ? attachments.map((a: any) => `${baseUrl}/api/public/inbox/attachment/${a.id}/${a.publicToken}`)
      : [];

    const sendResult = await sendOwnerTwilioSms({ ownerId, to: peer.peer, body, mediaUrls });
    if (!sendResult.ok) {
      const raw = String(sendResult.error ?? "").trim();
      const msg = raw.toLowerCase();

      if (msg.includes("not configured") || msg.includes("texting not configured")) {
        return { ok: false, error: "To send texts here, connect your Twilio number in Integrations." };
      }

      // Twilio is reachable but rejected the message. Surface a concise reason instead of a misleading
      // 'connection' error (common when the To-number is invalid/unreachable).
      if (msg.startsWith("twilio failed")) {
        const detail = raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : raw;
        const safeDetail = detail.replace(/\s+/g, " ").slice(0, 240);
        return { ok: false, error: safeDetail ? `Twilio rejected the message: ${safeDetail}` : "Twilio rejected the message." };
      }

      if (msg.includes("twilio")) {
        const safe = raw.replace(/\s+/g, " ").slice(0, 240);
        return { ok: false, error: safe ? `Text send failed: ${safe}` : "Text send failed." };
      }

      return { ok: false, error: "We couldn’t send that text right now. Please try again." };
    }

    const threadKey = existingThread?.channel === "SMS" ? String(existingThread.threadKey) : makeSmsThreadKey(peer.peer).threadKey;
    const peerAddress = existingThread?.channel === "SMS" ? String(existingThread.peerAddress) : peer.peer;
    const peerKey = existingThread?.channel === "SMS" ? String(existingThread.peerKey) : peer.peerKey;

    const logged = await upsertPortalInboxMessage({
      ownerId,
      channel: "SMS",
      direction: "OUT",
      threadKey,
      peerAddress,
      peerKey,
      fromAddress: twilioCfg?.fromNumberE164 || "TWILIO",
      toAddress: peer.peer,
      bodyText: fallbackBodyText,
      provider: "TWILIO",
      providerMessageId: sendResult.messageSid ?? null,
    });

    if (attachments.length) {
      await (prisma as any).portalInboxAttachment.updateMany({
        where: { ownerId, id: { in: attachments.map((a: any) => a.id) }, messageId: null },
        data: { messageId: logged.messageId },
      });
    }

    try {
      await runOwnerAutomationsForEvent({
        ownerId,
        triggerKind: "outbound_sent",
        message: { from: twilioCfg?.fromNumberE164 || "", to: peer.peer, body: body || "" },
        contact: {
          id: contactRow?.id ? String(contactRow.id) : null,
          name: contactRow?.name ? String(contactRow.name) : peer.peer,
          email: contactRow?.email ? String(contactRow.email) : null,
          phone: contactRow?.phone ? String(contactRow.phone) : peer.peer,
        },
      });
    } catch {
      // ignore
    }

    return { ok: true, threadId: logged.threadId };
  }

  // EMAIL
  const subjectRaw = renderTextTemplate(String(input.subject ?? ""), templateVars).trim();
  const subjectKey = normalizeSubjectKey(subjectRaw);
  const subject = subjectRaw || "(no subject)";

  const thread = makeEmailThreadKey(toRaw, subjectKey);
  if (!thread) return { ok: false, error: "Invalid email" };

  const metered = await recordThresholdMeterUsage({
    ownerId,
    spec: {
      meterKey: "inbox_messages_v1",
      unitSize: PORTAL_CREDIT_COSTS.inboxMessagesPerUnit,
      creditsPerUnit: PORTAL_CREDIT_COSTS.inboxCreditsPerUnit,
    },
    increment: 1,
    note: "inbox_send_email",
  });
  if (!metered.ok) {
    return { ok: false, error: metered.error };
  }

  const mailbox = await getOrCreateOwnerMailboxAddress(ownerId).catch(() => null);

  try {
    await sendEmail({
      to: thread.peerKey,
      subject,
      text: body || " ",
      fromEmail: mailbox?.emailAddress || undefined,
      fromName: profile?.businessName || "Purely Automation",
      attachments: attachments.map((a: any) => ({
        fileName: String(a.fileName || "attachment").slice(0, 200),
        mimeType: String(a.mimeType || "application/octet-stream"),
        bytes: a.bytes as Buffer,
      })),
    });
  } catch (err) {
    const provider = getOutboundEmailProvider();
    const configured = isOutboundEmailConfigured();

    const rawMsg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "We couldn’t send that email right now.";

    const msg =
      !configured ? `Email is not configured yet. ${missingOutboundEmailConfigReason()}` : rawMsg;

    console.error("portal inbox send email failed", {
      ownerId,
      provider,
      to: thread.peerKey,
      message: String(rawMsg || "").slice(0, 500),
    });

    return { ok: false, error: String(msg || "Send failed").slice(0, 500) };
  }

  const threadKey = existingThread?.channel === "EMAIL" ? String(existingThread.threadKey) : thread.threadKey;
  const peerAddress = existingThread?.channel === "EMAIL" ? String(existingThread.peerAddress) : thread.peerAddress;
  const peerKey = existingThread?.channel === "EMAIL" ? String(existingThread.peerKey) : thread.peerKey;

  const logged = await upsertPortalInboxMessage({
    ownerId,
    channel: "EMAIL",
    direction: "OUT",
    threadKey,
    peerAddress,
    peerKey,
    subject,
    subjectKey: thread.subjectKey,
    fromAddress: mailbox?.emailAddress || getOutboundEmailFrom().fromEmail || "purelyautomation@purelyautomation.com",
    toAddress: thread.peerKey,
    bodyText: fallbackBodyText,
    provider: getOutboundEmailProvider() || "POSTMARK",
    providerMessageId: null,
  });

  if (attachments.length) {
    await (prisma as any).portalInboxAttachment.updateMany({
      where: { ownerId, id: { in: attachments.map((a: any) => a.id) }, messageId: null },
      data: { messageId: logged.messageId },
    });
  }

  try {
    await runOwnerAutomationsForEvent({
      ownerId,
      triggerKind: "outbound_sent",
      message: { from: getOutboundEmailFrom().fromEmail || "", to: thread.peerKey, body: body || "" },
      contact: {
        id: contactRow?.id ? String(contactRow.id) : null,
        name: contactRow?.name ? String(contactRow.name) : thread.peerKey,
        email: contactRow?.email ? String(contactRow.email) : thread.peerKey,
        phone: contactRow?.phone ? String(contactRow.phone) : null,
      },
    });
  } catch {
    // ignore
  }

  return { ok: true, threadId: logged.threadId };
}

export type SchedulePortalInboxMessageInput = {
  ownerId: string;
  channel: PortalInboxChannel;
  to: string;
  subject?: string;
  body?: string;
  attachmentIds?: string[];
  threadId?: string;
  sendAt: Date;
};

export async function schedulePortalInboxMessage(
  input: SchedulePortalInboxMessageInput,
): Promise<{ ok: true; scheduledId: string } | { ok: false; error: string }> {
  const ownerId = String(input.ownerId || "").trim();
  if (!ownerId) return { ok: false, error: "Missing owner" };

  const channel = input.channel;
  if (channel !== "email" && channel !== "sms") return { ok: false, error: "Invalid channel" };

  const to = String(input.to || "").trim();
  if (!to) return { ok: false, error: "Missing recipient" };

  let toNormalized = to;

  const bodyInput = String(input.body ?? "");
  const attachmentIds = asStringArray(input.attachmentIds).slice(0, 10);
  if (!String(bodyInput || "").trim() && attachmentIds.length === 0) {
    return { ok: false, error: "Message or attachment is required" };
  }

  const scheduledFor = input.sendAt;
  if (!(scheduledFor instanceof Date) || !Number.isFinite(scheduledFor.getTime())) {
    return { ok: false, error: "Invalid scheduled time" };
  }

  await ensurePortalInboxSchema();

  if (channel === "sms") {
    const peer = normalizeSmsPeerKey(to);
    if (peer.error) return { ok: false, error: peer.error };
    if (!peer.peer || !peer.peerKey) return { ok: false, error: "Invalid phone" };
    toNormalized = peer.peer;
  }

  if (channel === "email") {
    const thread = makeEmailThreadKey(to, normalizeSubjectKey(String(input.subject ?? "")));
    if (!thread) return { ok: false, error: "Invalid email" };
    toNormalized = thread.peerKey;
  }

  if (attachmentIds.length) {
    const found = await (prisma as any).portalInboxAttachment.findMany({
      where: { ownerId, id: { in: attachmentIds }, messageId: null },
      select: { id: true },
    });
    if (found.length !== attachmentIds.length) {
      return { ok: false, error: "One or more attachments are missing." };
    }
  }

  const id = randomUUID();
  const now = new Date();

  await (prisma as any).portalInboxScheduledMessage.create({
    data: {
      id,
      ownerId,
      threadId: input.threadId ? String(input.threadId) : null,
      channel: channel === "email" ? "EMAIL" : "SMS",
      toAddress: toNormalized,
      subject: input.subject ? String(input.subject) : null,
      bodyText: bodyInput,
      attachmentIds,
      scheduledFor,
      status: "PENDING",
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: now,
      updatedAt: now,
    },
  });

  return { ok: true, scheduledId: id };
}

export async function processDuePortalInboxScheduledMessages({
  baseUrl,
  limit,
}: {
  baseUrl: string;
  limit: number;
}): Promise<{ ok: true; processed: number; sent: number; failed: number } | { ok: false; error: string }> {
  try {
    await ensurePortalInboxSchema();

    const now = new Date();
    const due = (await (prisma as any).portalInboxScheduledMessage.findMany({
      where: { status: "PENDING", scheduledFor: { lte: now } },
      orderBy: { scheduledFor: "asc" },
      take: Math.max(1, Math.min(500, limit || 50)),
    })) as any[];

    let sent = 0;
    let failed = 0;

    for (const row of due) {
      const id = String(row.id || "");
      if (!id) continue;

      const claim = await (prisma as any).portalInboxScheduledMessage.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "SENDING", updatedAt: new Date() },
      });

      if (!claim?.count) continue;

      const ownerId = String(row.ownerId || "");
      const channel = String(row.channel || "").toUpperCase() === "EMAIL" ? "email" : "sms";

      const result = await sendPortalInboxMessageNow({
        ownerId,
        channel,
        to: String(row.toAddress || ""),
        subject: row.subject ? String(row.subject) : undefined,
        body: row.bodyText ? String(row.bodyText) : "",
        attachmentIds: Array.isArray(row.attachmentIds) ? row.attachmentIds.map((x: any) => String(x)) : [],
        threadId: row.threadId ? String(row.threadId) : undefined,
        baseUrl,
      });

      if (result.ok) {
        sent += 1;
        await (prisma as any).portalInboxScheduledMessage.update({
          where: { id },
          data: { status: "SENT", sentAt: new Date(), updatedAt: new Date(), lastError: null },
        });
        continue;
      }

      failed += 1;

      const attemptsPrev = typeof row.attempts === "number" && Number.isFinite(row.attempts) ? row.attempts : 0;
      const attemptsNext = attemptsPrev + 1;
      const shouldRetry = attemptsNext < 3;

      await (prisma as any).portalInboxScheduledMessage.update({
        where: { id },
        data: {
          status: shouldRetry ? "PENDING" : "FAILED",
          attempts: attemptsNext,
          lastError: String(result.error || "Send failed").slice(0, 500),
          scheduledFor: shouldRetry ? new Date(Date.now() + 2 * 60 * 1000) : row.scheduledFor,
          updatedAt: new Date(),
        },
      });
    }

    return { ok: true, processed: due.length, sent, failed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
