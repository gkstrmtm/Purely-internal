import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { baseUrlFromRequest } from "@/lib/leadOutbound";
import { schedulePortalInboxMessage, sendPortalInboxMessageNow } from "@/lib/portalInboxSend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function splitRecipientList(raw: string): string[] {
  const s = String(raw || "").trim();
  if (!s) return [];
  const parts = s
    .split(/[\n\r,;]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 50) break;
  }
  return out;
}

const postSchema = z.object({
  channel: z.enum(["email", "sms"]),
  to: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(50)]),
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
  const toListRaw = Array.isArray(parsed.data.to) ? parsed.data.to : splitRecipientList(parsed.data.to);
  const toList = Array.from(new Set(toListRaw.map((x) => String(x || "").trim()).filter(Boolean))).slice(0, 50);
  const subject = parsed.data.subject;
  const body = parsed.data.body;
  const attachmentIds = Array.isArray(parsed.data.attachmentIds) ? parsed.data.attachmentIds : [];
  const threadId = parsed.data.threadId;

  if (!toList.length) {
    return NextResponse.json({ ok: false, error: "Missing recipient" }, { status: 400 });
  }

  if (threadId && toList.length > 1) {
    return NextResponse.json({ ok: false, error: "You can’t send to multiple recipients inside a single thread." }, { status: 400 });
  }

  const sendAtRaw = parsed.data.sendAt;
  if (sendAtRaw) {
    const when = new Date(sendAtRaw);
    if (!Number.isFinite(when.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid scheduled time" }, { status: 400 });
    }

    // If they're basically scheduling for "now", just send immediately.
    if (when.getTime() > Date.now() + 10_000) {
      const scheduledIds: string[] = [];
      for (const to of toList) {
        const scheduled = await schedulePortalInboxMessage({
          ownerId,
          channel,
          to,
          subject,
          body,
          attachmentIds,
          threadId: threadId && toList.length === 1 ? threadId : undefined,
          sendAt: when,
        });

        if (!scheduled.ok) {
          return NextResponse.json(
            { ok: false, error: scheduled.error },
            { status: scheduled.error === "Insufficient credits" ? 402 : 400 },
          );
        }
        scheduledIds.push(scheduled.scheduledId);
      }

      return NextResponse.json({
        ok: true,
        scheduled: true,
        scheduledId: scheduledIds[0] ?? null,
        scheduledIds,
        scheduledCount: scheduledIds.length,
        threadId: threadId ?? null,
      });
    }
  }

  const baseUrl = baseUrlFromRequest(req);
  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;
  let lastThreadId: string | null = null;

  for (const to of toList) {
    const result = await sendPortalInboxMessageNow({
      ownerId,
      channel,
      to,
      subject,
      body,
      attachmentIds,
      threadId: threadId && toList.length === 1 ? threadId : undefined,
      baseUrl,
    });
    if (result.ok) {
      sent += 1;
      lastThreadId = result.threadId;
    } else {
      failed += 1;
      if (!firstError) firstError = result.error;
    }
  }

  if (sent === 0) {
    return NextResponse.json(
      { ok: false, error: firstError || "Send failed" },
      { status: firstError === "Insufficient credits" ? 402 : 400 },
    );
  }

  return NextResponse.json({ ok: true, threadId: toList.length === 1 ? lastThreadId : null, sent, failed });
}
