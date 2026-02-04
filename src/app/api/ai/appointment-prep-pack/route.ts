import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { generateText } from "@/lib/ai";
import { buildPrepPackBase } from "@/lib/prepPack";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  tone: z.string().optional(),
  tweak: z.string().optional(),
  existingContent: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (role !== "CLOSER" && role !== "MANAGER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const [hasWebsite, hasLocation, hasNiche, hasContactPhone, hasInterestedService, hasNotes] =
      await Promise.all([
        hasPublicColumn("Lead", "website"),
        hasPublicColumn("Lead", "location"),
        hasPublicColumn("Lead", "niche"),
        hasPublicColumn("Lead", "contactPhone"),
        hasPublicColumn("Lead", "interestedService"),
        hasPublicColumn("Lead", "notes"),
      ]);

    const appt = await prisma.appointment.findUnique({
      where: { id: parsed.data.appointmentId },
      select: {
        id: true,
        leadId: true,
        closerId: true,
        prepDocId: true,
        lead: {
          select: {
            id: true,
            businessName: true,
            phone: true,
            contactName: true,
            contactEmail: true,
            ...(hasWebsite ? { website: true } : {}),
            ...(hasLocation ? { location: true } : {}),
            ...(hasNiche ? { niche: true } : {}),
            ...(hasContactPhone ? { contactPhone: true } : {}),
            ...(hasInterestedService ? { interestedService: true } : {}),
            ...(hasNotes ? { notes: true } : {}),
          } as const,
        },
        prepDoc: { select: { id: true, content: true } },
      },
    });

    if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (role === "CLOSER" && appt.closerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const leadRec = appt.lead as unknown as Record<string, unknown>;
    const interestedServiceRaw = leadRec.interestedService;
    const interestedService =
      typeof interestedServiceRaw === "string" && interestedServiceRaw.trim()
        ? interestedServiceRaw
        : deriveInterestedServiceFromNotes(leadRec.notes);

    const base = buildPrepPackBase({
      businessName: appt.lead.businessName,
      phone: appt.lead.phone,
      website: (leadRec.website as string | null | undefined) ?? null,
      location: (leadRec.location as string | null | undefined) ?? null,
      niche: (leadRec.niche as string | null | undefined) ?? null,
      contactName: appt.lead.contactName ?? null,
      contactEmail: appt.lead.contactEmail ?? null,
      contactPhone: (leadRec.contactPhone as string | null | undefined) ?? null,
      interestedService: interestedService ?? null,
      notes: (leadRec.notes as string | null | undefined) ?? null,
    });

    const existing =
      typeof parsed.data.existingContent === "string" && parsed.data.existingContent.trim()
        ? parsed.data.existingContent
        : appt.prepDoc?.content?.trim()
          ? appt.prepDoc.content
          : "";

    const tone = parsed.data.tone?.trim() || "direct, concise, organized";
    const tweak = parsed.data.tweak?.trim();

    const userPrompt = [
      "Generate a prep pack for an upcoming sales call.",
      "Do NOT invent facts. If missing, write '(unknown)'.",
      "Prefer short bullet lists over paragraphs.",
      "",
      `Tone: ${tone}`,
      tweak ? `Extra instruction: ${tweak}` : "",
      "",
      "Source lead info (do not add new facts):",
      base,
      "",
      existing ? "Existing prep pack (revise/expand; keep accurate):\n" + existing : "Existing prep pack: (none)",
      "",
      "Return markdown with sections:",
      "- Summary",
      "- Goals",
      "- Key facts",
      "- Discovery questions",
      "- Proof points",
      "- Next steps",
    ]
      .filter(Boolean)
      .join("\n");

    let content = base;
    try {
      content = await generateText({
        system: "You produce accurate, non-hallucinated prep packs.",
        user: userPrompt,
      });
    } catch {
      content = existing.trim() ? existing : base;
    }

    // Store the prep doc under the closer (so it shows in closer + manager closer view).
    const doc = await prisma.doc.upsert({
      where: {
        ownerId_leadId_kind: {
          ownerId: appt.closerId,
          leadId: appt.leadId,
          kind: "APPOINTMENT_PREP",
        },
      },
      update: {
        title: `Prep pack – ${appt.lead.businessName}`,
        content,
      },
      create: {
        ownerId: appt.closerId,
        leadId: appt.leadId,
        title: `Prep pack – ${appt.lead.businessName}`,
        kind: "APPOINTMENT_PREP",
        content,
      },
      select: { id: true, title: true, content: true, kind: true },
    });

    if (!appt.prepDocId) {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { prepDocId: doc.id },
        select: { id: true },
      });
    }

    return NextResponse.json({ doc });
  } catch (err) {
    console.error("/api/ai/appointment-prep-pack failed", err);
    return NextResponse.json({ error: "Failed to generate prep pack" }, { status: 500 });
  }
}
