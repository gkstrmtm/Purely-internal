import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  leadId: z.string().trim().min(1).max(64),
  toEmail: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(1).max(2000),
  sendEmail: z.boolean().optional(),
  sendSms: z.boolean().optional(),
});

async function sendEmail({
  to,
  subject,
  body,
  fromName,
}: {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    throw new Error("Email is not configured yet.");
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SendGrid failed (${res.status}): ${text.slice(0, 400)}`);
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
    throw new Error(`Twilio failed (${res.status}): ${text.slice(0, 400)}`);
  }
}

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const sendEmailRequested = Boolean(parsed.data.sendEmail);
  const sendSmsRequested = Boolean(parsed.data.sendSms);
  if (!sendEmailRequested && !sendSmsRequested) {
    return NextResponse.json({ error: "Choose Email and/or Text." }, { status: 400 });
  }

  const lead = await prisma.portalLead.findFirst({
    where: { id: parsed.data.leadId, ownerId },
    select: { id: true, businessName: true, phone: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });
  const fromName = profile?.businessName?.trim() || "Purely Automation";

  const subject = parsed.data.subject?.trim() || `Follow-up: ${lead.businessName}`;

  const sent = { email: false, sms: false };

  try {
    if (sendEmailRequested) {
      const toEmail = parsed.data.toEmail?.trim() || "";
      if (!toEmail) {
        return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
      }
      await sendEmail({ to: toEmail, subject, body: parsed.data.message, fromName });
      sent.email = true;
    }

    if (sendSmsRequested) {
      if (!lead.phone) {
        return NextResponse.json({ error: "This lead has no phone number." }, { status: 400 });
      }
      await sendSms({ ownerId, to: lead.phone, body: parsed.data.message.slice(0, 900) });
      sent.sms = true;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sent });
}
