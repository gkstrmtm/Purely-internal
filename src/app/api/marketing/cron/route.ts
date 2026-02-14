import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { sendMarketingEmail, sendMarketingSms } from "@/lib/marketingMessaging";

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
        msg.channel === "EMAIL"
          ? await sendMarketingEmail({ to: msg.to, subject: "Your Purely Automation demo request", body: msg.body })
          : await sendMarketingSms({ to: msg.to, body: msg.body });

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
