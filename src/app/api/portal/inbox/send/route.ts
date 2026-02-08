import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getOwnerTwilioSmsConfig, sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { sendEmail } from "@/lib/leadOutbound";
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
  body: z.string().min(1),
  threadId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const ownerId = auth.session.user.id;

  const channel = parsed.data.channel;
  const body = parsed.data.body.trim();
  const toRaw = parsed.data.to.trim();

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });

  // If replying, keep threading stable by reusing the existing thread.
  const existingThread = parsed.data.threadId
    ? await (prisma as any).portalInboxThread.findFirst({
        where: { id: parsed.data.threadId, ownerId },
        select: { id: true, channel: true, threadKey: true, peerAddress: true, peerKey: true, subject: true, subjectKey: true },
      })
    : null;

  if (channel === "sms") {
    const peer = normalizeSmsPeerKey(toRaw);
    if (peer.error) return NextResponse.json({ ok: false, error: peer.error }, { status: 400 });
    if (!peer.peer || !peer.peerKey) return NextResponse.json({ ok: false, error: "Invalid phone" }, { status: 400 });

    const twilioCfg = await getOwnerTwilioSmsConfig(ownerId);
    const sendResult = await sendOwnerTwilioSms({ ownerId, to: peer.peer, body });
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
      bodyText: body,
      provider: "TWILIO",
      providerMessageId: sendResult.messageSid ?? null,
    });

    return NextResponse.json({ ok: true, threadId: logged.threadId });
  }

  // EMAIL
  const subjectRaw = (parsed.data.subject ?? "").trim();
  const subjectKey = normalizeSubjectKey(subjectRaw);
  const subject = subjectRaw || "(no subject)";

  const thread = makeEmailThreadKey(toRaw, subjectKey);
  if (!thread) return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });

  try {
    await sendEmail({
      to: thread.peerKey,
      subject,
      text: body,
      fromName: profile?.businessName || "Purely Automation",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "We couldn’t send that email right now. Please try again." },
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
    fromAddress: process.env.SENDGRID_FROM_EMAIL || "purelyautomation@purelyautomation.com",
    toAddress: thread.peerKey,
    bodyText: body,
    provider: "SENDGRID",
    providerMessageId: null,
  });

  return NextResponse.json({ ok: true, threadId: logged.threadId });
}
