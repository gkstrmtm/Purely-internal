import { NextResponse } from "next/server";
import crypto from "crypto";

import { findOwnerIdByInboundSmsToNumberHistory, findOwnerIdByTwilioAccountSid, findOwnerIdByTwilioToNumber } from "@/lib/twilioRouting";
import { makeSmsThreadKey, normalizeSmsPeerKey, upsertPortalInboxMessage } from "@/lib/portalInbox";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { findPortalContactByPhone } from "@/lib/portalContacts";
import { listContactTagsForContact } from "@/lib/portalContactTags";
import { resumeScheduledPortalAiChatFromSms } from "@/lib/portalAiChatScheduled";
import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { getOwnerTwilioSmsConfig, sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { runOwnerAutomationsForInboundSms } from "@/lib/portalAutomationsRunner";
import { getAppBaseUrl, listPortalAccountRecipientContacts, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { queueAiOutboundMessageRepliesForInboundMessage } from "@/lib/portalAiOutboundMessages";
import { generateText } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function safeFilename(name: string) {
  return String(name || "attachment")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

function extFromMime(mimeType: string): string {
  const mt = String(mimeType || "").toLowerCase();
  if (mt.includes("jpeg")) return ".jpg";
  if (mt.includes("png")) return ".png";
  if (mt.includes("gif")) return ".gif";
  if (mt.includes("webp")) return ".webp";
  if (mt.includes("mp4")) return ".mp4";
  if (mt.includes("mpeg")) return ".mp3";
  if (mt.includes("pdf")) return ".pdf";
  return "";
}

const MAX_MEDIA = 10;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per attachment

function twimlEmpty() {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

function xmlEscape(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twimlMessage(message: string) {
  const body = String(message || "").trim();
  if (!body) return twimlEmpty();
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(body)}</Message></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "content-type": "application/xml" } });
}

function normalizeSmsReply(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  return oneLine.length > 900 ? `${oneLine.slice(0, 899)}…` : oneLine;
}

function isOptOutMessage(raw: string): boolean {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return false;
  if (s === "stop" || s === "unsubscribe" || s === "cancel" || s === "end" || s === "quit") return true;
  if (s.startsWith("stop ") || s.includes("\nstop") || s.includes("\rstop")) return true;
  return false;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function POST(req: Request) {
  const bodyRaw = await req.text().catch(() => "");
  const form = new URLSearchParams(bodyRaw);

  const accountSid = String(form.get("AccountSid") ?? "").trim();
  const from = String(form.get("From") ?? "").trim();
  const to = String(form.get("To") ?? "").trim();
  const body = String(form.get("Body") ?? "");
  const messageSid = String(form.get("MessageSid") ?? "").trim();

  // MMS fields (optional)
  const numMedia = Math.max(0, Math.min(MAX_MEDIA, Number(form.get("NumMedia") ?? 0) || 0));

  const ownerId =
    (to ? await findOwnerIdByTwilioToNumber(to) : null) ??
    (to ? await findOwnerIdByInboundSmsToNumberHistory(to) : null) ??
    (accountSid ? await findOwnerIdByTwilioAccountSid(accountSid) : null);
  if (!ownerId) return twimlEmpty();

  const peer = normalizeSmsPeerKey(from);
  if (!peer.peer || !peer.peerKey) return twimlEmpty();

  const peerPhone = peer.peer;

  const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(peerPhone);

  // Avoid runtime failures if schema patches haven't been applied yet.
  await ensurePortalInboxSchema();

  const { threadId, messageId } = await upsertPortalInboxMessage({
    ownerId,
    channel: "SMS",
    direction: "IN",
    threadKey,
    peerAddress,
    peerKey,
    fromAddress: from,
    toAddress: to,
    bodyText: body,
    provider: "TWILIO",
    providerMessageId: messageSid || null,
  });

  // AI Receptionist inbound SMS auto-reply (best-effort).
  // If we reply here, skip AI Outbound auto-reply queue to avoid double-sending.
  const tryAiReceptionistReply = async (): Promise<string | null> => {
    if (isOptOutMessage(body)) return null;

    const data = await getAiReceptionistServiceData(ownerId).catch(() => null);
    const s = data?.settings as any;
    if (!s || !s.smsEnabled) return null;

    const includeIds = Array.isArray(s.smsIncludeTagIds) ? (s.smsIncludeTagIds as unknown[]).map((x) => String(x || "").trim()).filter(Boolean) : [];
    const excludeIds = Array.isArray(s.smsExcludeTagIds) ? (s.smsExcludeTagIds as unknown[]).map((x) => String(x || "").trim()).filter(Boolean) : [];

    try {
      const contact = await findPortalContactByPhone({ ownerId, phone: peerPhone }).catch(() => null);
      const tags = contact?.id ? await listContactTagsForContact(ownerId, String(contact.id)) : [];
      const tagIds = new Set((tags || []).map((t) => String(t.id || "").trim()).filter(Boolean));

      if (excludeIds.length && excludeIds.some((id) => tagIds.has(id))) return null;
      if (includeIds.length && !includeIds.some((id) => tagIds.has(id))) return null;
    } catch {
      // If tag resolution fails and include rules exist, be conservative and do not reply.
      if (Array.isArray((s as any).smsIncludeTagIds) && (s as any).smsIncludeTagIds.length) return null;
    }

    let historyText = "";
    try {
      const rows = await (prisma as any).portalInboxMessage.findMany({
        where: { ownerId, threadId },
        orderBy: { createdAt: "asc" },
        take: 12,
        select: { direction: true, bodyText: true },
      });

      const lines: string[] = [];
      for (const r of rows || []) {
        const dir = String(r?.direction || "").toUpperCase() === "OUT" ? "Assistant" : "Customer";
        const t = String(r?.bodyText || "").trim();
        if (!t) continue;
        lines.push(`${dir}: ${t.replace(/\s+/g, " ").slice(0, 400)}`);
        if (lines.join("\n").length > 3500) break;
      }
      historyText = lines.join("\n").trim();
    } catch {
      // ignore
    }

    const businessName = typeof s.businessName === "string" ? s.businessName.trim() : "";
    const smsPrompt = typeof s.smsSystemPrompt === "string" ? s.smsSystemPrompt.trim() : "";
    const basePrompt = smsPrompt || (typeof s.systemPrompt === "string" ? s.systemPrompt.trim() : "");

    const system = [
      basePrompt || "You are a helpful receptionist.",
      "You are replying via SMS.",
      "Keep replies concise: 1-3 short sentences, under 320 characters when possible.",
      "No markdown. No long lists. Ask at most one question.",
      businessName ? `Business name: ${businessName}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 6000);

    const user = [
      historyText ? "Conversation:\n" + historyText : "",
      `Latest inbound SMS from ${from} to ${to}:`,
      String(body || "").trim().slice(0, 2000),
      "\nWrite the SMS reply text only.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const ai = await withTimeout(generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4" }), 5500).catch(() => "");
    const reply = normalizeSmsReply(ai);
    return reply || null;
  };

  const receptionistReply = await tryAiReceptionistReply().catch(() => null);

  const scheduledResume = await withTimeout(
    resumeScheduledPortalAiChatFromSms({ ownerId, fromPhone: peerPhone, body }),
    2500,
  ).catch(() => null);

  if (scheduledResume?.matched) {
    return twimlMessage(scheduledResume.replyText || "Got it - I'll continue that scheduled task and follow up in the portal.");
  }

  if (receptionistReply) {
    try {
      await upsertPortalInboxMessage({
        ownerId,
        channel: "SMS",
        direction: "OUT",
        threadKey,
        peerAddress,
        peerKey,
        fromAddress: to,
        toAddress: from,
        bodyText: receptionistReply,
        provider: "AI_RECEPTIONIST",
        providerMessageId: null,
      });
    } catch {
      // ignore
    }

    return twimlMessage(receptionistReply);
  }

  // Best-effort: queue AI Outbound message auto-replies (sent by cron).
  // Keep this fast to avoid Twilio webhook timeouts.
  try {
    await withTimeout(queueAiOutboundMessageRepliesForInboundMessage({ ownerId, threadId, messageId }), 1200);
  } catch {
    // ignore
  }

  // Best-effort: notify portal users (keep this fast).
  try {
    const baseUrl = getAppBaseUrl();

    // SMS notification to the portal user's phone (using the owner's Twilio config).
    // Best-effort and intentionally not written into the Inbox.
    try {
      const contacts = await listPortalAccountRecipientContacts(ownerId, "inbound_sms");
      const toPhones = contacts
        .map((c) => c.phoneE164)
        .filter(Boolean) as string[];

      const unique = Array.from(new Set(toPhones));
      const smsBody = [
        `New inbound SMS from ${from}`,
        body ? String(body).trim().slice(0, 500) : null,
        `${baseUrl}/portal/app/inbox`,
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 900);

      if (unique.length && smsBody.trim()) {
        await withTimeout(
          Promise.all(unique.map((phone) => sendOwnerTwilioSms({ ownerId, to: phone, body: smsBody, logToInbox: false }))),
          3500,
        );
      }
    } catch {
      // ignore
    }

    await withTimeout(
      tryNotifyPortalAccountUsers({
        ownerId,
        kind: "inbound_sms",
        subject: `Inbound SMS from ${from}`,
        text: [
          "A new inbound SMS was received.",
          "",
          `From: ${from}`,
          `To: ${to}`,
          "",
          body ? `Message: ${body.slice(0, 1000)}` : null,
          numMedia ? `Media: ${numMedia}` : null,
          "",
          `Open inbox: ${baseUrl}/portal/app/inbox`,
          messageId ? `Message ID: ${messageId}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
      2000,
    );
  } catch {
    // ignore
  }

  // Best-effort: trigger automations for inbound SMS.
  // Keep this fast to avoid Twilio webhook timeouts.
  try {
    await withTimeout(runOwnerAutomationsForInboundSms({ ownerId, from, to, body }), 2500);
  } catch {
    // ignore
  }

  // Best-effort: fetch MMS media and store as attachments + mirror to Media Library.
  if (numMedia > 0) {
    try {
      const cfg = await getOwnerTwilioSmsConfig(ownerId);
      const authHeader = cfg
        ? `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`
        : null;

      for (let i = 0; i < numMedia; i += 1) {
        const mediaUrl = String(form.get(`MediaUrl${i}`) ?? "").trim();
        if (!mediaUrl) continue;

        const hintedType = String(form.get(`MediaContentType${i}`) ?? "").trim();
        const res = await fetch(mediaUrl, {
          headers: authHeader ? { authorization: authHeader } : undefined,
        }).catch(() => null);
        if (!res || !res.ok) continue;

        const contentLength = Number(res.headers.get("content-length") ?? 0) || 0;
        if (contentLength && contentLength > MAX_BYTES) continue;

        const mimeType = String(res.headers.get("content-type") || hintedType || "application/octet-stream").slice(0, 120);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (!buffer.length || buffer.length > MAX_BYTES) continue;

        const sidPart = messageSid ? messageSid.slice(-8) : "";
        const fileName = safeFilename(`mms-${sidPart || "msg"}-${i}${extFromMime(mimeType)}`);
        const publicToken = crypto.randomUUID().replace(/-/g, "");

        await (prisma as any).portalInboxAttachment.create({
          data: {
            ownerId,
            messageId,
            fileName,
            mimeType,
            fileSize: buffer.length,
            bytes: buffer,
            publicToken,
          },
          select: { id: true },
        });

        try {
          await mirrorUploadToMediaLibrary({ ownerId, fileName, mimeType, bytes: buffer });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  return twimlEmpty();
}

export async function GET() {
  // Twilio will POST. Keep GET harmless for quick health checks.
  return NextResponse.json({ ok: true });
}
