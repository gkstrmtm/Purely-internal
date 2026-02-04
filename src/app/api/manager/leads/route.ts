import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "MANAGER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const takeRaw = url.searchParams.get("take");
  const takeParsed = takeRaw ? Number(takeRaw) : undefined;
  const take = Math.max(1, Math.min(500, Number.isFinite(takeParsed as number) ? (takeParsed as number) : 200));

  const [hasContactPhone, hasInterestedService, hasNotes] = await Promise.all([
    hasPublicColumn("Lead", "contactPhone"),
    hasPublicColumn("Lead", "interestedService"),
    hasPublicColumn("Lead", "notes"),
  ]);

  const leadSelect = {
    id: true,
    businessName: true,
    phone: true,
    contactName: true,
    contactEmail: true,
    ...(hasContactPhone ? { contactPhone: true } : {}),
    ...(hasInterestedService ? { interestedService: true } : {}),
    ...(hasNotes ? { notes: true } : {}),
    niche: true,
    location: true,
    source: true,
    status: true,
    createdAt: true,
    assignments: {
      where: { releasedAt: null },
      select: {
        claimedAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { claimedAt: "desc" },
      take: 1,
    },
    appointments: {
      where: { status: { in: ["SCHEDULED", "RESCHEDULED"] as Array<"SCHEDULED" | "RESCHEDULED"> } },
      orderBy: { startAt: "desc" },
      take: 1,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        closer: { select: { id: true, name: true, email: true } },
      },
    },
  } as const;

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: leadSelect,
  });

  const normalized = leads.map((l) => {
    const record = l as unknown as Record<string, unknown>;
    const contactPhoneValue = record.contactPhone;
    const interestedServiceValue = record.interestedService;
    const notesValue = record.notes;

    const contactPhone = typeof contactPhoneValue === "string" ? contactPhoneValue : null;
    const interestedService =
      typeof interestedServiceValue === "string" && interestedServiceValue.trim()
        ? interestedServiceValue
        : deriveInterestedServiceFromNotes(notesValue);

    return {
      ...l,
      contactPhone,
      interestedService,
      notes: typeof notesValue === "string" ? notesValue : null,
    };
  });

  return NextResponse.json({ leads: normalized });
}
