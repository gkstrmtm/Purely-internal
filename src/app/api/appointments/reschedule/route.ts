import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { buildPrepPackBase } from "@/lib/prepPack";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  startAt: z.string().optional(),
  durationMinutes: z.number().int().min(10).max(180).optional(),
  closerId: z.string().min(1).optional(),
  confirmAddAvailability: z.boolean().optional(),
});

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export async function POST(req: Request) {
  try {
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
      select: {
        id: true,
        leadId: true,
        setterId: true,
        closerId: true,
        startAt: true,
        endAt: true,
        status: true,
        prepDocId: true,
      },
    });
    if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

    // Authorization: managers/admins can edit any, dialers only their own, closers only their own.
    if (role === "DIALER" && appt.setterId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (role === "CLOSER" && appt.closerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (role !== "ADMIN" && role !== "MANAGER" && role !== "DIALER" && role !== "CLOSER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (appt.status !== "SCHEDULED" && appt.status !== "RESCHEDULED") {
      return NextResponse.json({ error: "Only scheduled appointments can be rescheduled" }, { status: 409 });
    }

    const currentDurationMinutes = Math.max(
      10,
      Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60_000),
    );
    const durationMinutes = parsed.data.durationMinutes ?? currentDurationMinutes;

    const startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : new Date(appt.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    }
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    const targetCloserId = parsed.data.closerId ?? appt.closerId;

    const targetCloser = await prisma.user.findUnique({
      where: { id: targetCloserId },
      select: { id: true, role: true, active: true },
    });
    if (!targetCloser || targetCloser.role !== "CLOSER" || !targetCloser.active) {
      return NextResponse.json({ error: "Closer not found" }, { status: 404 });
    }

    // Conflicts always block.
    const conflicts = await prisma.appointment.findMany({
      where: {
        id: { not: appt.id },
        closerId: targetCloserId,
        status: { in: ["SCHEDULED", "RESCHEDULED"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { startAt: true, endAt: true },
      take: 10,
    });
    for (const c of conflicts) {
      if (overlaps(startAt, endAt, c.startAt, c.endAt)) {
        return NextResponse.json(
          { error: "That closer is not free at that time. Pick another closer or time." },
          { status: 409 },
        );
      }
    }

    // Coverage check; closer can override for themselves, and managers/admins can override when explicitly confirmed.
    const coverage = await prisma.availabilityBlock.findFirst({
      where: {
        userId: targetCloserId,
        startAt: { lte: startAt },
        endAt: { gte: endAt },
      },
      select: { id: true },
    });

    const wantsOverride = Boolean(parsed.data.confirmAddAvailability);
    const isCloserSelfOverride = role === "CLOSER" && userId === targetCloserId && wantsOverride;
    const isManagerOverride = (role === "MANAGER" || role === "ADMIN") && wantsOverride;
    const canOverrideCoverage = isCloserSelfOverride || isManagerOverride;

    if (!coverage && !canOverrideCoverage) {
      return NextResponse.json(
        { error: "That closer is not available at that time. Pick another closer or time." },
        { status: 409 },
      );
    }

    // If closer confirms override, add a block for exactly that slot.
    if (!coverage && canOverrideCoverage) {
      await prisma.availabilityBlock.create({
        data: { userId: targetCloserId, startAt, endAt },
        select: { id: true },
      });
    }

    // If closer changed, ensure appointment prep doc belongs to the new closer.
    let prepDocIdToUse = appt.prepDocId ?? null;
    if (targetCloserId !== appt.closerId) {
      try {
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
          where: { id: appt.leadId },
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

        if (lead) {
          const leadRec = lead as unknown as Record<string, unknown>;
          const base = buildPrepPackBase({
            businessName: lead.businessName,
            phone: lead.phone,
            website: (leadRec.website as string | null | undefined) ?? null,
            location: (leadRec.location as string | null | undefined) ?? null,
            niche: (leadRec.niche as string | null | undefined) ?? null,
            contactName: (lead.contactName as string | null | undefined) ?? null,
            contactEmail: (lead.contactEmail as string | null | undefined) ?? null,
            contactPhone: (leadRec.contactPhone as string | null | undefined) ?? null,
            interestedService: (leadRec.interestedService as string | null | undefined) ?? null,
            notes: (leadRec.notes as string | null | undefined) ?? null,
          });

          const dialerPrep = await prisma.doc.findFirst({
            where: { leadId: lead.id, kind: "LEAD_PREP_PACK" },
            orderBy: { updatedAt: "desc" },
            select: { content: true },
          });

          const content = dialerPrep?.content?.trim() ? dialerPrep.content : base;

          const existingPrep = await prisma.doc.findFirst({
            where: { ownerId: targetCloserId, leadId: lead.id, kind: "APPOINTMENT_PREP" },
            select: { id: true },
          });

          prepDocIdToUse =
            existingPrep?.id ??
            (
              await prisma.doc.create({
                data: {
                  ownerId: targetCloserId,
                  leadId: lead.id,
                  title: `Prep pack – ${lead.businessName}`,
                  kind: "APPOINTMENT_PREP",
                  content,
                },
                select: { id: true },
              })
            ).id;
        }
      } catch {
        // Best-effort only.
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: appt.id },
      data: {
        closerId: targetCloserId,
        startAt,
        endAt,
        status: "SCHEDULED",
        ...(prepDocIdToUse ? { prepDocId: prepDocIdToUse } : {}),
      },
      select: { id: true, startAt: true, endAt: true, closerId: true, status: true },
    });

    return NextResponse.json({ ok: true, appointment: updated });
  } catch (err) {
    console.error("/api/appointments/reschedule failed", err);
    return NextResponse.json({ error: "Failed to reschedule appointment" }, { status: 500 });
  }
}
