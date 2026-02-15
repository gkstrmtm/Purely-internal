import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureAppointmentMeetingFieldsReady } from "@/lib/appointmentMeetingSchema";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  meetingPlatform: z.enum(["ZOOM", "GOOGLE_MEET", "OTHER"]).optional(),
  meetingJoinUrl: z.string().trim().max(2000).optional().nullable(),
});

function cleanUrl(u: unknown): string | null {
  const raw = typeof u === "string" ? u.trim() : "";
  if (!raw) return null;
  // Keep it permissive: allow any https? link (Zoom/Meet/custom).
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 2000);
  // If they paste without scheme, try to treat as https.
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return `https://${raw}`.slice(0, 2000);
  return raw.slice(0, 2000);
}

export async function POST(req: Request) {
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

  await ensureAppointmentMeetingFieldsReady().catch(() => null);

  const appt = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    select: { id: true, closerId: true },
  });

  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "CLOSER" && appt.closerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nextUrl = cleanUrl(parsed.data.meetingJoinUrl);
  const nextPlatform = parsed.data.meetingPlatform ?? null;

  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: {
      meetingPlatform: nextPlatform,
      meetingJoinUrl: nextUrl,
      meetingJoinUrlSetAt: nextUrl ? new Date() : null,
      meetingJoinUrlSetByUserId: nextUrl ? userId : null,
      // If meeting info changes, allow reminders to be re-sent.
      meetingReminder24hSentAt: null,
      meetingReminder1hSentAt: null,
    },
    select: {
      id: true,
      meetingPlatform: true,
      meetingJoinUrl: true,
      meetingJoinUrlSetAt: true,
    },
  });

  return NextResponse.json({ ok: true, appointment: updated });
}
