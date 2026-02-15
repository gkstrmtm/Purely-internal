import { getServerSession } from "next-auth";

import ManagerAppointmentsClient from "./ManagerAppointmentsClient";
import type { ManagerAppointment } from "./ManagerAppointmentsClient";

import { authOptions } from "@/lib/auth";
import { ensureAppointmentMeetingFieldsReady } from "@/lib/appointmentMeetingSchema";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { deriveInterestedServiceFromNotes } from "@/lib/leadDerived";

export default async function ManagerAppointmentsPage() {
  await ensureAppointmentMeetingFieldsReady().catch(() => null);

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;

  if (!userId || (role !== "MANAGER" && role !== "ADMIN")) {
    return <ManagerAppointmentsClient initialAppointments={[]} />;
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

  const appts = await prisma.appointment.findMany({
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      meetingPlatform: true,
      meetingJoinUrl: true,
      meetingJoinUrlSetAt: true,
      loomUrl: true,
      lead: {
        select: {
          id: true,
          businessName: true,
          phone: true,
          ...(await hasPublicColumn("Lead", "interestedService")
            ? { interestedService: true }
            : {}),
          ...(await hasPublicColumn("Lead", "notes") ? { notes: true } : {}),
        } as const,
      },
      setter: { select: { name: true, email: true } },
      closer: { select: { name: true, email: true } },
      outcome: { select: { outcome: true, notes: true, revenueCents: true } },
    },
    orderBy: { startAt: "desc" },
    take: 200,
  });

  const normalized = appts.map((a) => {
    const leadRec = a.lead as unknown as Record<string, unknown>;
    const interestedServiceRaw = leadRec.interestedService;
    const interestedService =
      typeof interestedServiceRaw === "string" && interestedServiceRaw.trim()
        ? interestedServiceRaw
        : deriveInterestedServiceFromNotes(leadRec.notes);

    const lead = { ...a.lead, interestedService };
    return { ...a, lead };
  });

  const initialAppointments = await attachVideos(normalized);
  return (
    <ManagerAppointmentsClient
      initialAppointments={initialAppointments as unknown as ManagerAppointment[]}
    />
  );
}
