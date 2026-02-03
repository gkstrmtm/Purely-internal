import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

async function sendInternalEmail(subject: string, body: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) return;

  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: "purestayservice@gmail.com" }] }],
      from: { email: fromEmail, name: "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  }).catch(() => null);
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(1).max(40),
  goals: z.string().trim().max(400).optional(),
  optedIn: z.boolean().optional().default(false),
});

function normalizePhoneForStorage(inputRaw: string) {
  const input = inputRaw.trim();
  if (!input) return null;

  const hasPlus = input.startsWith("+");
  const digits = input.replace(/\D/g, "");

  // Basic sanity: most valid numbers are 10-15 digits.
  if (digits.length < 10 || digits.length > 15) return null;

  if (!hasPlus) {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  return `+${digits}`;
}

function buildEmailBody(name: string) {
  return [
    `Hi ${name},`,
    "",
    "Thanks for checking out Purely Automation.",
    "",
    "This demo was triggered automatically a few minutes after you requested it.",
    "",
    "If you want, book a call right here and we will get you set up.",
  ].join("\n");
}

function buildSmsBody() {
  return "Purely Automation demo: book a call on the site when you are ready.";
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      const field = first?.path?.[0];

      let message = "Please check your details and try again.";
      if (field === "name") message = "Please enter your name.";
      if (field === "company") message = "Please enter your company name.";
      if (field === "email") message = "Please enter a valid email address.";
      if (field === "phone") message = "Please enter a valid phone number.";

      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { name, company, email, phone, goals, optedIn } = parsed.data;
    const normalizedPhone = normalizePhoneForStorage(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }

    const interestedService = goals?.trim() ? goals.trim() : null;

    // Always create a new lead for marketing requests.
    // (Lead fields are not unique; avoiding upsert prevents runtime errors.)
    const lead = await prisma.lead.create({
      data: {
        businessName: company,
        phone: normalizedPhone,
        contactName: name,
        contactEmail: email,
        contactPhone: normalizedPhone,
        interestedService: interestedService,
        source: "MARKETING",
        notes: goals?.trim() ? `Marketing demo request\nGoals: ${goals.trim()}` : "Marketing demo request",
      },
    });

    const request = await prisma.marketingDemoRequest.upsert({
      where: { leadId: lead.id },
      update: { name, company, email, phone: normalizedPhone, optedIn },
      create: { leadId: lead.id, name, company, email, phone: normalizedPhone, optedIn },
    });

    const now = new Date();
    const followUpAt = new Date(now.getTime() + 5 * 60_000);

    const emailBody = buildEmailBody(name);
    const smsBody = buildSmsBody();

    const messages: Array<{
      requestId: string;
      channel: "EMAIL" | "SMS";
      to: string;
      body: string;
      sendAt: Date;
    }> = [
      { requestId: request.id, channel: "EMAIL", to: email, body: emailBody, sendAt: now },
      { requestId: request.id, channel: "EMAIL", to: email, body: emailBody, sendAt: followUpAt },
    ];

    if (optedIn) {
      messages.push({ requestId: request.id, channel: "SMS", to: normalizedPhone, body: smsBody, sendAt: now });
      messages.push({
        requestId: request.id,
        channel: "SMS",
        to: normalizedPhone,
        body: smsBody,
        sendAt: followUpAt,
      });
    }

    // Best-effort: the form submission should succeed even if follow-up scheduling breaks.
    try {
      await prisma.marketingMessage.createMany({ data: messages });
    } catch {
      // Swallow message-scheduling failures.
    }

    // Best-effort internal notification.
    try {
      const subject = "New demo request";
      const body = [
        "A new demo request was submitted.",
        "",
        `Name: ${name}`,
        `Company: ${company}`,
        `Email: ${email}`,
        `Phone: ${normalizedPhone}`,
        goals?.trim() ? `Goals: ${goals.trim()}` : null,
        `Opted in: ${optedIn ? "yes" : "no"}`,
        "",
        `LeadId: ${lead.id}`,
        `RequestId: ${request.id}`,
      ]
        .filter(Boolean)
        .join("\n");

      await sendInternalEmail(subject, body);
    } catch {
      // Swallow internal-email failures.
    }

    return NextResponse.json({ requestId: request.id, leadId: lead.id });
  } catch {
    // Ensure the client always receives JSON (not a generic HTML 500).
    return NextResponse.json(
      { error: "Submit failed. Please try again." },
      { status: 500 },
    );
  }
}
