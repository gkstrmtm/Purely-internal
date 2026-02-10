import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  channel: z.enum(["EMAIL", "SMS"]),
  to: z.string().trim().min(3).max(200),
  subject: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(2000),
});

async function sendEmail({ to, subject, body, fromName }: { to: string; subject: string; body: string; fromName: string }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) throw new Error("Email is not configured yet.");

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${text.slice(0, 400)}`);
  }
}

async function sendSms({ ownerId, to, body }: { ownerId: string; to: string; body: string }) {
  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) throw new Error("Texting is not configured yet.");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
  const basic = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", twilio.fromNumberE164);
  form.set("Body", body.slice(0, 900));

  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SMS send failed (${res.status}): ${text.slice(0, 400)}`);
  }
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("followUp");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const profile = await prisma.businessProfile.findUnique({ where: { ownerId }, select: { businessName: true } });
  const fromName = profile?.businessName?.trim() || "Purely Automation";

  if (parsed.data.channel === "EMAIL") {
    await sendEmail({
      to: parsed.data.to,
      subject: parsed.data.subject?.trim() || "Test follow-up",
      body: parsed.data.body,
      fromName,
    });
  } else {
    await sendSms({ ownerId, to: parsed.data.to, body: parsed.data.body });
  }

  return NextResponse.json({ ok: true, note: "Sent." });
}
