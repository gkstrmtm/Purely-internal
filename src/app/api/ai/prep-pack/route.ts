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
  leadId: z.string().min(1),
  tone: z.string().optional(),
  tweak: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const lead = await prisma.lead.findUnique({
      where: { id: parsed.data.leadId },
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
    });

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const leadRec = lead as unknown as Record<string, unknown>;
    const interestedServiceRaw = leadRec.interestedService;
    const interestedService =
      typeof interestedServiceRaw === "string" && interestedServiceRaw.trim()
        ? interestedServiceRaw
        : deriveInterestedServiceFromNotes(leadRec.notes);

    const base = buildPrepPackBase({
      businessName: lead.businessName,
      phone: lead.phone,
      website: (leadRec.website as string | null | undefined) ?? null,
      location: (leadRec.location as string | null | undefined) ?? null,
      niche: (leadRec.niche as string | null | undefined) ?? null,
      contactName: lead.contactName ?? null,
      contactEmail: lead.contactEmail ?? null,
      contactPhone: (leadRec.contactPhone as string | null | undefined) ?? null,
      interestedService: interestedService ?? null,
      notes: (leadRec.notes as string | null | undefined) ?? null,
    });

    const tone = parsed.data.tone?.trim() || "direct, concise, organized";
    const tweak = parsed.data.tweak?.trim();

    const userPrompt = [
      "Write a one-page prep pack for a sales call.",
      "It must be practical and skimmable.",
      "Do NOT invent facts; only rephrase/structure what is provided.",
      "If something is missing, write '(unknown)' rather than guessing.",
      "",
      `Tone: ${tone}`,
      tweak ? `Extra instruction: ${tweak}` : "",
      "",
      "Use this source material (do not add new facts):",
      base,
      "",
      "Return markdown with sections:",
      "- Summary", 
      "- What they want (goals)",
      "- Current situation (unknowns allowed)",
      "- Discovery questions", 
      "- Proof points to mention", 
      "- Proposed next steps",
    ]
      .filter(Boolean)
      .join("\n");

    let content = base;
    try {
      content = await generateText({
        system: "You create accurate, non-hallucinated sales prep packs.",
        user: userPrompt,
      });
    } catch {
      // If AI fails, fall back to the compiled base content.
      content = base;
    }

    const doc = await prisma.doc.upsert({
      where: {
        ownerId_leadId_kind: {
          ownerId: userId,
          leadId: lead.id,
          kind: "LEAD_PREP_PACK",
        },
      },
      update: {
        title: `Prep pack – ${lead.businessName}`,
        content,
      },
      create: {
        ownerId: userId,
        leadId: lead.id,
        title: `Prep pack – ${lead.businessName}`,
        kind: "LEAD_PREP_PACK",
        content,
      },
      select: { id: true, title: true, content: true },
    });

    return NextResponse.json({ doc });
  } catch (err) {
    console.error("/api/ai/prep-pack failed", err);
    return NextResponse.json({ error: "Failed to generate prep pack" }, { status: 500 });
  }
}
