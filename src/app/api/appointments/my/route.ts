import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { ensureAppointmentMeetingFieldsReady } from "@/lib/appointmentMeetingSchema";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

export async function GET() {
  try {
    await ensureAppointmentMeetingFieldsReady().catch(() => null);

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const role = session?.user?.role;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    async function attachVideos<T extends { id: string }>(appts: T[]) {
      if (!appts.length) return appts;

    type AppointmentVideoRow = { appointmentId: string } & Record<string, unknown>;
    type AppointmentVideoDelegate = {
      findMany: (args: { where: { appointmentId: { in: string[] } } }) => Promise<AppointmentVideoRow[]>;
    };

    const appointmentVideo = (prisma as unknown as { appointmentVideo?: AppointmentVideoDelegate })
      .appointmentVideo;
    if (!appointmentVideo?.findMany) {
      return appts.map((a) => ({ ...a, video: null }));
    }

    try {
      const videos = await appointmentVideo.findMany({
        where: { appointmentId: { in: appts.map((a) => a.id) } },
      });
      const byAppointmentId = new Map(videos.map((v) => [v.appointmentId, v] as const));

      return appts.map((a) => ({ ...a, video: byAppointmentId.get(a.id) ?? null }));
    } catch {
      return appts.map((a) => ({ ...a, video: null }));
    }
    }

    const [
      hasContactPhone,
      hasInterestedService,
      hasNotes,
      hasSource,
      hasWebsite,
      hasLocation,
      hasNiche,
    ] = await Promise.all([
      hasPublicColumn("Lead", "contactPhone"),
      hasPublicColumn("Lead", "interestedService"),
      hasPublicColumn("Lead", "notes"),
      hasPublicColumn("Lead", "source"),
      hasPublicColumn("Lead", "website"),
      hasPublicColumn("Lead", "location"),
      hasPublicColumn("Lead", "niche"),
    ]);

    const leadSelect = {
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
      ...(hasSource ? { source: true } : {}),
    } as const;

    const appointmentSelect = {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      meetingPlatform: true,
      meetingJoinUrl: true,
      meetingJoinUrlSetAt: true,
      loomUrl: true,
      lead: { select: leadSelect },
      closer: { select: { name: true, email: true } },
      setter: { select: { name: true, email: true } },
      prepDoc: { select: { id: true, title: true, content: true, kind: true } },
      outcome: { select: { outcome: true, revenueCents: true, notes: true } },
    } as const;

    function normalize<T extends { id: string; lead: Record<string, unknown> | null }>(appts: T[]) {
      return appts.map((a) => {
        const lead = (a.lead ?? {}) as Record<string, unknown>;
        const notes = lead.notes;
        const interestedServiceRaw = lead.interestedService;
        const interestedService =
          typeof interestedServiceRaw === "string" && interestedServiceRaw.trim()
            ? interestedServiceRaw
            : deriveInterestedServiceFromNotes(notes);

        const contactPhoneRaw = lead.contactPhone;
        const contactPhone =
          typeof contactPhoneRaw === "string" && contactPhoneRaw.trim() ? contactPhoneRaw : null;

        return {
          ...a,
          lead: {
            ...lead,
            contactPhone,
            interestedService,
          },
        } as T;
      });
    }

    if (role === "CLOSER") {
      const appts = await prisma.appointment.findMany({
        where: { closerId: userId },
        select: appointmentSelect,
        orderBy: { startAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ appointments: await attachVideos(normalize(appts)) });
    }

    if (role === "DIALER") {
      const appts = await prisma.appointment.findMany({
        where: { setterId: userId },
        select: {
          ...appointmentSelect,
          // Dialers don't need the prep doc on the list view.
          prepDoc: false,
        },
        orderBy: { startAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ appointments: await attachVideos(normalize(appts)) });
    }

    const appts = await prisma.appointment.findMany({
      select: appointmentSelect,
      orderBy: { startAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ appointments: await attachVideos(normalize(appts)) });
  } catch (err) {
    console.error("/api/appointments/my failed", err);
    return NextResponse.json({ error: "Failed to load appointments" }, { status: 500 });
  }
}
