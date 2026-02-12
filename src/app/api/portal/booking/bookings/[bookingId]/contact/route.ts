import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { renderTextTemplate } from "@/lib/textTemplate";
import { sendTransactionalEmail } from "@/lib/emailSender";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(1).max(2000),
  sendEmail: z.boolean().optional(),
  sendSms: z.boolean().optional(),
});

function formatWhen(startAt: Date, timeZone: string) {
  try {
    return startAt.toLocaleString(undefined, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return startAt.toLocaleString();
  }
}

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
  await sendTransactionalEmail({ to, subject, text: body, fromName });
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { bookingId } = await params;
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

  const site = await prisma.portalBookingSite.findUnique({
    where: { ownerId },
    select: { id: true, title: true, timeZone: true },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.siteId !== site.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });
  const fromName = profile?.businessName?.trim() || site.title || "Purely Automation";

  const subjectTemplate = parsed.data.subject?.trim() || `Follow-up: ${site.title}`;
  const messageTemplate = parsed.data.message;

  const when = formatWhen(new Date(booking.startAt), site.timeZone);
  const vars = {
    ...buildPortalTemplateVars({
      contact: {
        id: booking.contactId ?? null,
        name: booking.contactName ?? null,
        email: booking.contactEmail ?? null,
        phone: booking.contactPhone ?? null,
      },
      business: { name: fromName },
    }),
    when,
    timeZone: site.timeZone,
    startAt: new Date(booking.startAt).toISOString(),
    endAt: new Date(booking.endAt).toISOString(),
    bookingTitle: site.title,
    calendarTitle: site.title,
  };

  const subject = renderTextTemplate(subjectTemplate, vars).trim().slice(0, 120) || subjectTemplate;
  const message = renderTextTemplate(messageTemplate, vars);

  const sent = { email: false, sms: false };

  if (sendEmailRequested) {
    if (!booking.contactEmail) {
      return NextResponse.json({ error: "This booking has no email address." }, { status: 400 });
    }
    await sendEmail({
      to: booking.contactEmail,
      subject,
      body: message,
      fromName,
    });
    sent.email = true;
  }

  if (sendSmsRequested) {
    if (!booking.contactPhone) {
      return NextResponse.json({ error: "This booking has no phone number." }, { status: 400 });
    }
    await sendSms({ ownerId, to: booking.contactPhone, body: message.slice(0, 900) });
    sent.sms = true;
  }

  return NextResponse.json({ ok: true, sent });
}
