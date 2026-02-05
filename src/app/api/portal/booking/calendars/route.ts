import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { getBookingCalendarsConfig, setBookingCalendarsConfig } from "@/lib/bookingCalendars";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  calendars: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(50),
        enabled: z.boolean().optional(),
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().max(400).optional(),
        durationMinutes: z.number().int().min(10).max(180).optional(),
        meetingLocation: z.string().trim().max(120).optional(),
        meetingDetails: z.string().trim().max(600).optional(),
        notificationEmails: z.array(z.string().trim().email()).max(20).optional(),
      }),
    )
    .max(25),
});

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const config = await getBookingCalendarsConfig(ownerId);
  return NextResponse.json({ ok: true, config });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const saved = await setBookingCalendarsConfig(ownerId, {
    version: 1,
    calendars: parsed.data.calendars.map((c) => ({ ...c, enabled: c.enabled ?? true })),
  });
  return NextResponse.json({ ok: true, config: saved });
}
