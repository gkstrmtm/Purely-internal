import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(40).optional(),
  optedIn: z.boolean().optional().default(false),
});

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
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { name, company, email, phone, optedIn } = parsed.data;

  // Always create a new lead for marketing requests.
  // (Lead fields are not unique; avoiding upsert prevents runtime errors.)
  const lead = await prisma.lead.create({
    data: {
      businessName: company,
      phone: phone ?? "unknown",
      contactName: name,
      contactEmail: email,
      source: "MARKETING",
      notes: "Marketing demo request",
    },
  });

  const request = await prisma.marketingDemoRequest.upsert({
    where: { leadId: lead.id },
    update: { name, company, email, phone: phone ?? null, optedIn },
    create: { leadId: lead.id, name, company, email, phone: phone ?? null, optedIn },
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

  if (optedIn && phone) {
    messages.push({ requestId: request.id, channel: "SMS", to: phone, body: smsBody, sendAt: now });
    messages.push({
      requestId: request.id,
      channel: "SMS",
      to: phone,
      body: smsBody,
      sendAt: followUpAt,
    });
  }

  await prisma.marketingMessage.createMany({ data: messages });

  return NextResponse.json({ requestId: request.id, leadId: lead.id });
}
