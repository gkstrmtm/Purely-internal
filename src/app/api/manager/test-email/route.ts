import { NextResponse } from "next/server";

import { requireManagerSession } from "@/lib/apiAuth";
import {
  getOutboundEmailFrom,
  getOutboundEmailProvider,
  missingOutboundEmailConfigReason,
  trySendTransactionalEmail,
} from "@/lib/emailSender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isProbablyEmail(s: string) {
  const t = safeOneLine(s).toLowerCase();
  return Boolean(t) && t.includes("@");
}

export async function POST(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return new NextResponse(null, { status: auth.status });

  const body = (await req.json().catch(() => null)) as any;

  const toRaw = typeof body?.to === "string" ? body.to : "jaylan1293l@gmail.com";
  const to = safeOneLine(toRaw);

  if (!isProbablyEmail(to)) {
    return NextResponse.json({ ok: false, error: "Invalid `to` email" }, { status: 400 });
  }

  const subject = safeOneLine(typeof body?.subject === "string" ? body.subject : "Purely Automation test email")
    .slice(0, 160);
  const text = String(typeof body?.text === "string" ? body.text : "Test email sent from Purely Automation.")
    .trim()
    .slice(0, 20_000);

  const envProvider = getOutboundEmailProvider();
  const envFrom = getOutboundEmailFrom();

  const sendResult = await trySendTransactionalEmail({
    to,
    subject: subject || "Purely Automation test email",
    text: `${text}\n\nTimestamp: ${new Date().toISOString()}`,
  });

  return NextResponse.json({
    ok: sendResult.ok,
    sendResult,
    env: {
      provider: envProvider,
      fromEmail: envFrom.fromEmail,
      fromName: envFrom.fromName,
      postmarkMessageStream: safeOneLine(process.env.POSTMARK_MESSAGE_STREAM || "") || null,
      missingConfigReason: envProvider && envFrom.fromEmail ? null : missingOutboundEmailConfigReason(),
    },
  });
}
