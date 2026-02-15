import { getServerSession } from "next-auth";

import CloserAppointmentsClient from "./CloserAppointmentsClient";
import type { CloserAppointment } from "./CloserAppointmentsClient";

import { authOptions } from "@/lib/auth";
import { ensureAppointmentMeetingFieldsReady } from "@/lib/appointmentMeetingSchema";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

export default async function CloserAppointmentsPage() {
  await ensureAppointmentMeetingFieldsReady().catch(() => null);

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (!userId) {
    return <CloserAppointmentsClient initialAppointments={[]} />;
  }

  if (role !== "CLOSER" && role !== "MANAGER" && role !== "ADMIN") {
    return <CloserAppointmentsClient initialAppointments={[]} />;
  }

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

  // For closers: only their appointments. For managers/admin: all.
  const where = role === "CLOSER" ? { closerId: userId } : undefined;

  const [hasContactPhone, hasInterestedService, hasNotes, hasSource, hasWebsite, hasLocation, hasNiche] = await Promise.all([
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

  const appts = await prisma.appointment.findMany({
    where,
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      meetingPlatform: true,
      meetingJoinUrl: true,
      meetingJoinUrlSetAt: true,
      loomUrl: true,
      lead: { select: leadSelect },
      setter: { select: { name: true, email: true } },
      prepDoc: { select: { id: true, title: true, content: true, kind: true } },
      outcome: { select: { outcome: true, notes: true } },
    },
    orderBy: { startAt: "desc" },
    take: 100,
  });

  const normalized = appts.map((a) => {
    const leadRec = a.lead as unknown as Record<string, unknown>;
    const notes = leadRec.notes;
    const interestedServiceRaw = leadRec.interestedService;

    const interestedService =
      typeof interestedServiceRaw === "string" && interestedServiceRaw.trim()
        ? interestedServiceRaw
        : deriveInterestedServiceFromNotes(notes);

    const contactPhoneValue = leadRec.contactPhone;
    const contactPhone =
      typeof contactPhoneValue === "string" && contactPhoneValue.trim() ? contactPhoneValue : null;

    return {
      ...a,
      lead: {
        ...(a.lead ?? {}),
        contactPhone,
        interestedService,
      },
    };
  });

  const initialAppointments = await attachVideos(normalized);
  return (
    <CloserAppointmentsClient
      initialAppointments={initialAppointments as unknown as CloserAppointment[]}
    />
  );
}
