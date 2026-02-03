import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateText } from "@/lib/ai";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  tone: z.string().optional(),
  tweak: z.string().optional(),
  prepContent: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const appt = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    include: {
      lead: true,
      prepDoc: { select: { id: true, title: true, content: true, kind: true } },
      setter: { select: { name: true, email: true } },
      closer: { select: { name: true, email: true } },
    },
  });

  if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  if (role === "CLOSER" && appt.closerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tone = parsed.data.tone?.trim() || "consultative, calm, confident";
  const tweak = parsed.data.tweak?.trim();
  const prep = (parsed.data.prepContent ?? appt.prepDoc?.content ?? "").trim();

  const contactLine = appt.lead.contactName
    ? `Contact: ${appt.lead.contactName}${appt.lead.contactEmail ? ` (${appt.lead.contactEmail})` : ""}${appt.lead.contactPhone ? ` • ${appt.lead.contactPhone}` : ""}`
    : "Contact: (not provided)";

  const userPrompt = [
    "Write a discovery / closer call script for a sales meeting.",
    "This is NOT a cold outbound opener — assume the meeting is booked and you are the closer.",
    "You are calling FROM: Purely Automation. Always say the company name exactly as 'Purely Automation'.",
    "If a contact person's name is provided, use it naturally in the script.",
    "",
    `Business: ${appt.lead.businessName}`,
    appt.lead.niche ? `Niche: ${appt.lead.niche}` : "",
    appt.lead.location ? `Location: ${appt.lead.location}` : "",
    appt.lead.website ? `Website: ${appt.lead.website}` : "",
    contactLine,
    appt.lead.interestedService ? `Interested in: ${appt.lead.interestedService}` : "",
    "",
    appt.setter?.name ? `Setter: ${appt.setter.name} (${appt.setter.email})` : "",
    appt.closer?.name ? `Closer: ${appt.closer.name} (${appt.closer.email})` : "",
    "",
    prep ? "Prep pack (use this as the primary context):\n" + prep : "Prep pack: (none provided)",
    "",
    `Tone: ${tone}`,
    tweak ? `Extra instruction: ${tweak}` : "",
    "",
    "Include:",
    "- Opening: set agenda + time check + permission",
    "- 8–12 discovery questions (goals, current process, pain, constraints, decision process, timeline)",
    "- Qualification section (budget, authority, need, timing)",
    "- Light positioning: 2–3 ways we help + how it maps to their context",
    "- Objection handling for: 'need to think', 'send info', 'too expensive', 'already have someone'",
    "- Close: clear next step + recap + confirm stakeholders",
    "",
    "Return plain text with headings and bullet points. Keep it practical for live calls.",
  ]
    .filter(Boolean)
    .join("\n");

  const content = await generateText({
    system: "You are an elite closer writing practical discovery scripts that follow consultative selling best practices.",
    user: userPrompt,
  });

  const doc = await prisma.doc.upsert({
    where: {
      ownerId_leadId_kind: {
        ownerId: userId,
        leadId: appt.leadId,
        kind: "CLOSER_SCRIPT",
      },
    },
    update: {
      title: `Closer Script – ${appt.lead.businessName}`,
      content,
    },
    create: {
      ownerId: userId,
      leadId: appt.leadId,
      title: `Closer Script – ${appt.lead.businessName}`,
      kind: "CLOSER_SCRIPT",
      content,
    },
    select: { id: true, title: true, content: true },
  });

  return NextResponse.json({ doc });
}
