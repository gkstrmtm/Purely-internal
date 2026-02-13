import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { missingOutboundEmailConfigReason, trySendTransactionalEmail } from "@/lib/emailSender";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

type SendResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string };

async function sendEmail(to: string, body: string): Promise<SendResult> {
  const r = await trySendTransactionalEmail({
    to,
    subject: "Your Purely Automation demo",
    text: body,
    fromName: "Purely Automation",
  });

  if (r.ok) return { ok: true };
  if (r.skipped) return { ok: false, skipped: true, reason: missingOutboundEmailConfigReason() };
  return { ok: false, reason: r.reason };
}

async function sendSms(to: string, body: string): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", fromNumber);
  form.set("Body", body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Twilio failed (${res.status}): ${text.slice(0, 500)}` };
  }

  return { ok: true };
}

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const secret = process.env.MARKETING_CRON_SECRET;
  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-marketing-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.marketingMessage.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: 25,
  });

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const msg of due) {
    // Claim the message (avoid duplicates under concurrent cron runs)
    const claimed = await prisma.marketingMessage.updateMany({
      where: { id: msg.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) continue;

    processed++;

    try {
      const result =
        msg.channel === "EMAIL" ? await sendEmail(msg.to, msg.body) : await sendSms(msg.to, msg.body);

      if (result.ok) {
        sent++;
        await prisma.marketingMessage.update({
          where: { id: msg.id },
          data: { status: "SENT", sentAt: new Date(), error: null },
        });
      } else if (result.skipped) {
        skipped++;
        await prisma.marketingMessage.update({
          where: { id: msg.id },
          data: { status: "SKIPPED", sentAt: new Date(), error: result.reason },
        });
      } else {
        failed++;
        await prisma.marketingMessage.update({
          where: { id: msg.id },
          data: { status: "FAILED", error: result.reason },
        });
      }
    } catch (e) {
      failed++;
      await prisma.marketingMessage.update({
        where: { id: msg.id },
        data: { status: "FAILED", error: e instanceof Error ? e.message : "Unknown error" },
      });
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped, failed });
}
