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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ownerId = await findOwnerByPortalInboxWebhookToken(token);
  if (!ownerId) return NextResponse.json({ ok: true });

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
    provider: "POSTMARK_INBOUND",
    providerMessageId,
  });

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
