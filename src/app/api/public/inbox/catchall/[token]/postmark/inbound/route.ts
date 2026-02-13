import { NextResponse } from "next/server";
import crypto from "crypto";

import { stripHtml } from "@/lib/leadOutbound";
import {
  extractEmailAddress,
  makeEmailThreadKey,
  normalizeSubjectKey,
  upsertPortalInboxMessage,
} from "@/lib/portalInbox";
import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { extractAllEmailAddresses, findOwnerIdByMailboxEmailAddress } from "@/lib/portalMailbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeFilename(name: string) {
  return String(name || "attachment")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

const MAX_ATTACHMENTS = 10;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per attachment

function safeString(x: unknown) {
  return typeof x === "string" ? x : "";
}

function isAuthorizedToken(tokenRaw: string) {
  const expected = String(process.env.PORTAL_INBOX_CATCHALL_TOKEN || "").trim();
  const token = String(tokenRaw || "").trim();
  return Boolean(expected && token && token === expected);
}

async function resolveOwnerIdFromRecipients(toCandidates: string[]) {
  for (const raw of toCandidates) {
    const ownerId = await findOwnerIdByMailboxEmailAddress(raw).catch(() => null);
    if (ownerId) return ownerId;
  }
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAuthorizedToken(token)) return NextResponse.json({ ok: true });

  const json = await req.json().catch(() => null);
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return NextResponse.json({ ok: true });
  }

  const rec = json as Record<string, unknown>;

  const fromRaw =
    safeString((rec.FromFull as any)?.Email) ||
    safeString(rec.From) ||
    safeString((rec.FromFull as any)?.Name) ||
    "";

  const toRaw =
    safeString((Array.isArray(rec.ToFull) ? (rec.ToFull as any[])[0]?.Email : (rec.ToFull as any)?.Email)) ||
    safeString(rec.To) ||
    "";

  const subjectRaw = safeString(rec.Subject);
  const textRaw = safeString(rec.TextBody);
  const htmlRaw = safeString(rec.HtmlBody);
  const providerMessageId = safeString(rec.MessageID) || safeString((rec as any).MessageId) || null;

  const fromEmail = extractEmailAddress(fromRaw) ?? "";
  if (!fromEmail) return NextResponse.json({ ok: true });

  const toCandidates = extractAllEmailAddresses(toRaw);
  const ownerId = await resolveOwnerIdFromRecipients(toCandidates);
  if (!ownerId) return NextResponse.json({ ok: true });

  const toEmail = (toCandidates[0] || "").trim();

  const bodyText = (textRaw || "").trim() || (htmlRaw ? stripHtml(htmlRaw) : "");
  const subjectKey = normalizeSubjectKey(subjectRaw);

  const thread = makeEmailThreadKey(fromEmail, subjectKey);
  if (!thread) return NextResponse.json({ ok: true });

  await ensurePortalInboxSchema();

  const { messageId } = await upsertPortalInboxMessage({
    ownerId,
    channel: "EMAIL",
    direction: "IN",
    threadKey: thread.threadKey,
    peerAddress: thread.peerAddress,
    peerKey: thread.peerKey,
    subject: subjectRaw || "(no subject)",
    subjectKey: thread.subjectKey,
    fromAddress: fromEmail || fromRaw,
    toAddress: toEmail || toRaw,
    bodyText: bodyText || " ",
    provider: "POSTMARK_INBOUND",
    providerMessageId,
  });

  try {
    const baseUrl = getAppBaseUrl();
    void tryNotifyPortalAccountUsers({
      ownerId,
      kind: "inbound_email",
      subject: `Inbound email: ${subjectRaw || "(no subject)"}`,
      text: [
        "A new inbound email was received.",
        "",
        `From: ${fromEmail || fromRaw}`,
        toEmail || toRaw ? `To: ${toEmail || toRaw}` : null,
        `Subject: ${subjectRaw || "(no subject)"}`,
        "",
        bodyText ? `Preview: ${String(bodyText).slice(0, 500)}` : null,
        "",
        `Open inbox: ${baseUrl}/portal/app/inbox`,
        messageId ? `Message ID: ${messageId}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    }).catch(() => null);
  } catch {
    // ignore
  }

  try {
    await runOwnerAutomationsForEvent({
      ownerId,
      triggerKind: "inbound_email",
      message: { from: fromEmail || fromRaw, to: toEmail || toRaw, body: bodyText || "" },
      contact: { email: fromEmail || null, name: fromRaw || null },
    });
  } catch {
    // ignore
  }

  try {
    const attachmentsRaw = Array.isArray(rec.Attachments) ? (rec.Attachments as any[]) : [];
    const attachments = attachmentsRaw.slice(0, MAX_ATTACHMENTS);

    for (const a of attachments) {
      const name = safeFilename(safeString(a?.Name) || "attachment");
      const mimeType = safeString(a?.ContentType || "application/octet-stream").slice(0, 120);
      const contentB64 = safeString(a?.Content);
      if (!contentB64) continue;

      const buffer = Buffer.from(contentB64, "base64");
      if (!buffer.length || buffer.length > MAX_BYTES) continue;

      const publicToken = crypto.randomUUID().replace(/-/g, "");

      await (prisma as any).portalInboxAttachment.create({
        data: {
          ownerId,
          messageId,
          fileName: name,
          mimeType,
          fileSize: buffer.length,
          bytes: buffer,
          publicToken,
        },
        select: { id: true },
      });

      try {
        await mirrorUploadToMediaLibrary({ ownerId, fileName: name, mimeType, bytes: buffer });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
