import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { getOwnerTwilioSmsConfig, sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { baseUrlFromRequest, sendEmail } from "@/lib/leadOutbound";
import {
  getOutboundEmailFrom,
  getOutboundEmailProvider,
  isOutboundEmailConfigured,
  missingOutboundEmailConfigReason,
} from "@/lib/emailSender";
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  channel: z.enum(["email", "sms"]),
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().optional(),
  attachmentIds: z.array(z.string().min(1)).max(10).optional(),
  threadId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ownerId = auth.session.user.id;

  // Avoid runtime failures if migrations haven't been applied yet.
  await ensurePortalInboxSchema();

  const channel = parsed.data.channel;
  const bodyInput = String(parsed.data.body ?? "");
  const toRaw = parsed.data.to.trim();
  const attachmentIds = Array.isArray(parsed.data.attachmentIds) ? parsed.data.attachmentIds : [];

  if (!String(bodyInput || "").trim() && attachmentIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Message or attachment is required" }, { status: 400 });
  }

  const attachments = attachmentIds.length
    ? await (prisma as any).portalInboxAttachment.findMany({
        where: { ownerId, id: { in: attachmentIds }, messageId: null },
        select: { id: true, fileName: true, mimeType: true, fileSize: true, bytes: true, publicToken: true },
      })
    : [];

  if (attachmentIds.length && attachments.length !== attachmentIds.length) {
    return NextResponse.json({ ok: false, error: "One or more attachments are missing." }, { status: 400 });
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });

  const ownerUser = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true } }).catch(() => null);
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

  // If replying, keep threading stable by reusing the existing thread.
  const existingThread = parsed.data.threadId
    ? await (prisma as any).portalInboxThread.findFirst({
        where: { id: parsed.data.threadId, ownerId },
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
          select: { id: true, name: true, email: true, phone: true },
        })
        .catch(() => null)
    : null;

  const templateVars = buildPortalTemplateVars({
    contact: {
      id: contactRow?.id ? String(contactRow.id) : null,
      name: contactRow?.name ? String(contactRow.name) : null,
      email: contactRow?.email ? String(contactRow.email) : null,
      phone: contactRow?.phone ? String(contactRow.phone) : null,
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
    if (peer.error) return NextResponse.json({ ok: false, error: peer.error }, { status: 400 });
    if (!peer.peer || !peer.peerKey) return NextResponse.json({ ok: false, error: "Invalid phone" }, { status: 400 });

    const twilioCfg = await getOwnerTwilioSmsConfig(ownerId);
    const baseUrl = baseUrlFromRequest(req);
    const mediaUrls = attachments.map((a: any) => `${baseUrl}/api/public/inbox/attachment/${a.id}/${a.publicToken}`);

    const sendResult = await sendOwnerTwilioSms({ ownerId, to: peer.peer, body, mediaUrls });
    if (!sendResult.ok) {
      const msg = String(sendResult.error ?? "").toLowerCase();
      if (msg.includes("not configured") || msg.includes("texting not configured")) {
        return NextResponse.json(
          { ok: false, error: "To send texts here, connect your Twilio number in Integrations." },
          { status: 400 },
        );
      }

      if (msg.includes("twilio")) {
        return NextResponse.json(
          { ok: false, error: "We couldn’t send that text. Please verify your Twilio connection and try again." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { ok: false, error: "We couldn’t send that text right now. Please try again." },
        { status: 400 },
      );
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

    // Best-effort: trigger portal automations for outbound sends.
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

    return NextResponse.json({ ok: true, threadId: logged.threadId });
  }

  // EMAIL
  const subjectRaw = renderTextTemplate(String(parsed.data.subject ?? ""), templateVars).trim();
  const subjectKey = normalizeSubjectKey(subjectRaw);
  const subject = subjectRaw || "(no subject)";

  const thread = makeEmailThreadKey(toRaw, subjectKey);
  if (!thread) return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });

  try {
    await sendEmail({
      to: thread.peerKey,
      subject,
      text: body || " ",
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
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "We couldn’t send that email right now.";

    const msg =
      !configured
        ? `Email is not configured yet. ${missingOutboundEmailConfigReason()}`
        : rawMsg;

    console.error("/api/portal/inbox/send email failed", {
      ownerId,
      provider,
      to: thread.peerKey,
      message: String(rawMsg || "").slice(0, 500),
    });

    return NextResponse.json(
      { ok: false, error: String(msg || "Send failed").slice(0, 500) },
      { status: 400 },
    );
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
    fromAddress: getOutboundEmailFrom().fromEmail || "purelyautomation@purelyautomation.com",
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

  // Best-effort: trigger portal automations for outbound sends.
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

  return NextResponse.json({ ok: true, threadId: logged.threadId });
}
