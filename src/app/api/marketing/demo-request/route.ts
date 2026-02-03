import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

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

  // Always create a new lead for marketing requests.
  // (Lead fields are not unique; avoiding upsert prevents runtime errors.)
  const lead = await prisma.lead.create({
    data: {
      businessName: company,
      phone: normalizedPhone,
      contactName: name,
      contactEmail: email,
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

  await prisma.marketingMessage.createMany({ data: messages });

  return NextResponse.json({ requestId: request.id, leadId: lead.id });
}
