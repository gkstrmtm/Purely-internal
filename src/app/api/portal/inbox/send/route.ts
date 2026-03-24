import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { baseUrlFromRequest } from "@/lib/leadOutbound";
import { schedulePortalInboxMessage, sendPortalInboxMessageNow } from "@/lib/portalInboxSend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  channel: z.enum(["email", "sms"]),
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().optional(),
  attachmentIds: z.array(z.string().min(1)).max(10).optional(),
  threadId: z.string().optional(),
  sendAt: z.string().datetime().optional(),
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

  const channel = parsed.data.channel;
  const to = parsed.data.to.trim();
  const subject = parsed.data.subject;
  const body = parsed.data.body;
  const attachmentIds = Array.isArray(parsed.data.attachmentIds) ? parsed.data.attachmentIds : [];
  const threadId = parsed.data.threadId;

  const sendAtRaw = parsed.data.sendAt;
  if (sendAtRaw) {
    const when = new Date(sendAtRaw);
    if (!Number.isFinite(when.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid scheduled time" }, { status: 400 });
    }

    // If they're basically scheduling for "now", just send immediately.
    if (when.getTime() > Date.now() + 10_000) {
      const scheduled = await schedulePortalInboxMessage({
        ownerId,
        channel,
        to,
        subject,
        body,
        attachmentIds,
        threadId,
        sendAt: when,
      });

      if (!scheduled.ok) {
        return NextResponse.json({ ok: false, error: scheduled.error }, { status: scheduled.error === "Insufficient credits" ? 402 : 400 });
      }

      return NextResponse.json({ ok: true, scheduled: true, scheduledId: scheduled.scheduledId, threadId: threadId ?? null });
    }
  }

  const baseUrl = baseUrlFromRequest(req);
  const result = await sendPortalInboxMessageNow({ ownerId, channel, to, subject, body, attachmentIds, threadId, baseUrl });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.error === "Insufficient credits" ? 402 : 400 },
    );
  }

  return NextResponse.json({ ok: true, threadId: result.threadId });
}
