import { prisma } from "@/lib/db";
import { ensureAppointmentMeetingFieldsReady } from "@/lib/appointmentMeetingSchema";
import { baseUrlFromRequest } from "@/lib/leadOutbound";
import { createConnectRoom } from "@/lib/connectRoomCreate";

export const PURELY_CONNECT_PLATFORM = "PURELY_CONNECT" as const;

export async function ensureAppointmentHasConnectMeeting(opts: {
  appointmentId: string;
  req?: Request;
  createdByUserId?: string | null;
  title?: string | null;
}): Promise<{ joinUrl: string; roomId: string } | null> {
  await ensureAppointmentMeetingFieldsReady().catch(() => null);

  const appt = await prisma.appointment.findUnique({
    where: { id: opts.appointmentId },
    select: {
      id: true,
      meetingJoinUrl: true,
    } as any,
  });

  if (!appt) return null;

  const existing = String((appt as any).meetingJoinUrl ?? "").trim();
  if (existing) return null;

  const room = await createConnectRoom({
    title: opts.title ?? null,
    createdByUserId: opts.createdByUserId ?? null,
    idLength: 5,
    maxAttempts: 12,
  });

  const baseUrl = baseUrlFromRequest(opts.req);
  const joinUrl = `${baseUrl}/connect/${encodeURIComponent(room.roomId)}`;

  await prisma.appointment.update({
    where: { id: appt.id },
    data: {
      meetingPlatform: PURELY_CONNECT_PLATFORM,
      meetingJoinUrl: joinUrl,
      meetingJoinUrlSetAt: new Date(),
      meetingJoinUrlSetByUserId: null,
      // Meeting info changed/appeared; allow reminders to be sent.
      meetingReminder24hSentAt: null,
      meetingReminder1hSentAt: null,
      meetingReminder15mEmailSentAt: null,
      meetingReminder15mSmsSentAt: null,
    } as any,
    select: { id: true } as any,
  });

  return { joinUrl, roomId: room.roomId };
}
