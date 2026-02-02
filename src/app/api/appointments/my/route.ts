import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
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

  if (role === "CLOSER") {
    const appts = await prisma.appointment.findMany({
      where: { closerId: userId },
      include: {
        lead: true,
        setter: { select: { name: true, email: true } },
        prepDoc: { select: { id: true, title: true, content: true, kind: true } },
        outcome: true,
      },
      orderBy: { startAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ appointments: await attachVideos(appts) });
  }

  if (role === "DIALER") {
    const appts = await prisma.appointment.findMany({
      where: { setterId: userId },
      include: {
        lead: true,
        closer: { select: { name: true, email: true } },
        outcome: true,
      },
      orderBy: { startAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ appointments: await attachVideos(appts) });
  }

  const appts = await prisma.appointment.findMany({
    include: {
      lead: true,
      closer: { select: { name: true, email: true } },
      setter: { select: { name: true, email: true } },
      prepDoc: { select: { id: true, title: true, content: true, kind: true } },
      outcome: true,
    },
    orderBy: { startAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ appointments: await attachVideos(appts) });
}
