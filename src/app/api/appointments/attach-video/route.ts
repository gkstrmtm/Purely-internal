import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (role !== "CLOSER" && role !== "MANAGER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { appointmentId?: unknown; url?: unknown; mimeType?: unknown; fileSize?: unknown }
    | null;

  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : null;
  const url = typeof body.url === "string" ? body.url : null;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : null;

  if (!appointmentId || !url || !fileSize) {
    return NextResponse.json({ error: "appointmentId, url, fileSize are required" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  if (role !== "MANAGER" && role !== "ADMIN" && appointment.closerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  type AppointmentVideoDelegate = {
    upsert: (args: {
      where: { appointmentId: string };
      update: { filePath: string; mimeType: string; fileSize: number };
      create: { appointmentId: string; filePath: string; mimeType: string; fileSize: number };
    }) => Promise<unknown>;
  };
  const appointmentVideo = (prisma as unknown as { appointmentVideo?: AppointmentVideoDelegate })
    .appointmentVideo;
  if (!appointmentVideo?.upsert) {
    return NextResponse.json(
      {
        error:
          "Server is missing AppointmentVideo Prisma client. Run `npm run db:generate` and restart dev server.",
      },
      { status: 500 },
    );
  }

  const video = await appointmentVideo.upsert({
    where: { appointmentId },
    update: { filePath: url, mimeType, fileSize },
    create: { appointmentId, filePath: url, mimeType, fileSize },
  });

  return NextResponse.json({ video });
}
