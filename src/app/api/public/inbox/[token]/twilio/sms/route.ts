import { NextResponse } from "next/server";
import crypto from "crypto";

import {
  findOwnerByPortalInboxWebhookToken,
  normalizeSmsPeerKey,
  makeSmsThreadKey,
  upsertPortalInboxMessage,
} from "@/lib/portalInbox";
import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { mirrorUploadToMediaLibrary } from "@/lib/portalMediaUploads";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ownerId = await findOwnerByPortalInboxWebhookToken(token);
  if (!ownerId) return twimlEmpty();

  const bodyRaw = await req.text().catch(() => "");
  const form = new URLSearchParams(bodyRaw);

  const from = String(form.get("From") ?? "").trim();
  const to = String(form.get("To") ?? "").trim();
  const body = String(form.get("Body") ?? "");
  const messageSid = String(form.get("MessageSid") ?? "").trim();

  // MMS fields (optional)
  const numMedia = Math.max(0, Math.min(MAX_MEDIA, Number(form.get("NumMedia") ?? 0) || 0));

  const peer = normalizeSmsPeerKey(from);
  if (!peer.peer || !peer.peerKey) return twimlEmpty();

  const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(peer.peer);

  // Avoid runtime failures if schema patches haven't been applied yet.
  await ensurePortalInboxSchema();

  const { messageId } = await upsertPortalInboxMessage({
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
