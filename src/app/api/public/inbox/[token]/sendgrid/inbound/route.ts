import { NextResponse } from "next/server";

import { stripHtml } from "@/lib/leadOutbound";
import {
  extractEmailAddress,
  findOwnerByPortalInboxWebhookToken,
  makeEmailThreadKey,
  normalizeSubjectKey,
  upsertPortalInboxMessage,
} from "@/lib/portalInbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  await upsertPortalInboxMessage({
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

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
