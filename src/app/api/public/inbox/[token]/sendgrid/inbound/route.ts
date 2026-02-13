import { NextResponse } from "next/server";
import crypto from "crypto";

import { stripHtml } from "@/lib/leadOutbound";
import {
  extractEmailAddress,
  findOwnerByPortalInboxWebhookToken,
  makeEmailThreadKey,
  normalizeSubjectKey,
  upsertPortalInboxMessage,
} from "@/lib/portalInbox";
import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { runOwnerAutomationsForEvent } from "@/lib/portalAutomationsRunner";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ownerId = await findOwnerByPortalInboxWebhookToken(token);
  if (!ownerId) return NextResponse.json({ ok: true });

  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: true });

  const fromRaw = String(fd.get("from") ?? "").trim();
  const toRaw = String(fd.get("to") ?? "").trim();
  const subjectRaw = String(fd.get("subject") ?? "");
  const textRaw = String(fd.get("text") ?? "");
  const htmlRaw = String(fd.get("html") ?? "");

  const fromEmail = extractEmailAddress(fromRaw) ?? "";
  const toEmail = extractEmailAddress(toRaw) ?? "";

  if (!fromEmail) return NextResponse.json({ ok: true });

  const bodyText = (textRaw || "").trim() || (htmlRaw ? stripHtml(htmlRaw) : "");
  const subjectKey = normalizeSubjectKey(subjectRaw);

  const thread = makeEmailThreadKey(fromEmail, subjectKey);
  if (!thread) return NextResponse.json({ ok: true });

  // Avoid runtime failures if schema patches haven't been applied yet.
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
    provider: "SENDGRID_INBOUND",
    providerMessageId: null,
  });

  // Best-effort: notify portal users.
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

  // Best-effort: fire inbound email automations.
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

  // Best-effort: store any inbound attachments.
  try {
    const fileValues = Array.from(fd.values()).filter((v): v is File => v instanceof File);
    const files = fileValues.slice(0, MAX_ATTACHMENTS);
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (!buffer.length || buffer.length > MAX_BYTES) continue;

      const fileName = safeFilename(file.name || "attachment.bin");
      const mimeType = String(file.type || "application/octet-stream").slice(0, 120);
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

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
