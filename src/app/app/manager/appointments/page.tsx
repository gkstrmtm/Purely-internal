import { getServerSession } from "next-auth";

import ManagerAppointmentsClient from "./ManagerAppointmentsClient";
import type { ManagerAppointment } from "./ManagerAppointmentsClient";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ManagerAppointmentsPage() {
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
    include: {
      lead: { select: { id: true, businessName: true, phone: true } },
      setter: { select: { name: true, email: true } },
      closer: { select: { name: true, email: true } },
      outcome: true,
    },
    orderBy: { startAt: "desc" },
    take: 200,
  });

  const initialAppointments = await attachVideos(appts);
  return (
    <ManagerAppointmentsClient
      initialAppointments={initialAppointments as unknown as ManagerAppointment[]}
    />
  );
}
