import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { generateText } from "@/lib/ai";

const bodySchema = z.object({
  leadId: z.string().min(1),
  tone: z.string().optional(),
  tweak: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [hasWebsite, hasLocation, hasNiche] = await Promise.all([
    hasPublicColumn("Lead", "website"),
    hasPublicColumn("Lead", "location"),
    hasPublicColumn("Lead", "niche"),
  ]);

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: {
      id: true,
      businessName: true,
      ...(hasNiche ? { niche: true } : {}),
      ...(hasLocation ? { location: true } : {}),
      ...(hasWebsite ? { website: true } : {}),
    } as const,
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const tone = parsed.data.tone?.trim() || "confident, concise, friendly";
  const tweak = parsed.data.tweak?.trim();

  const userPrompt = [
    "Write an outbound cold-call script for a phone call.",
    "You are calling FROM: Purely Automation. Always say the company name exactly as 'Purely Automation'.",
    "Who you are talking to: the business itself. Address them as the business name (not a person's name) unless they volunteer a personal name.",
    "Open with a direct line like: 'Hi, is this <Business Name>? This is <First Name> calling from Purely Automation.'",
    "Do not claim you were referred or have prior context unless explicitly provided.",
    `Business: ${lead.businessName}`,
    lead.niche ? `Niche: ${lead.niche}` : "",
    lead.location ? `Location: ${lead.location}` : "",
    lead.website ? `Website: ${lead.website}` : "",
    "",
    `Tone: ${tone}`,
    tweak ? `Extra instruction: ${tweak}` : "",
    "",
    "Include:",
    "- 10-second opener",
    "- 2 value hooks",
    "- 6 discovery questions",
    "- objection handles for: 'not interested', 'already have someone', 'no budget'",
    "- a clean CTA to book a short meeting",
    "",
    "Return plain text with headings and bullet points.",
  ]
    .filter(Boolean)
    .join("\n");

  const content = await generateText({
    system: "You are an elite outbound setter writing practical scripts.",
    user: userPrompt,
  });

  const doc = await prisma.doc.upsert({
    where: {
      ownerId_leadId_kind: {
        ownerId: userId,
        leadId: lead.id,
        kind: "DIALER_SCRIPT",
      },
    },
    update: {
      title: `Script – ${lead.businessName}`,
      content,
    },
    create: {
      ownerId: userId,
      leadId: lead.id,
      title: `Script – ${lead.businessName}`,
      kind: "DIALER_SCRIPT",
      content,
    },
    select: { id: true, title: true, content: true },
  });

  return NextResponse.json({ doc });
}
