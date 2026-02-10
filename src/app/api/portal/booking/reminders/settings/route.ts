import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  listAppointmentReminderEvents,
  parseAppointmentReminderSettings,
  getAppointmentReminderSettingsForCalendar,
  setAppointmentReminderSettingsForCalendar,
} from "@/lib/appointmentReminders";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const calendarId = url.searchParams.get("calendarId");

  const [selected, twilio, events] = await Promise.all([
    getAppointmentReminderSettingsForCalendar(ownerId, calendarId),
    getOwnerTwilioSmsConfigMasked(ownerId),
    listAppointmentReminderEvents(ownerId, 50),
  ]);

  return NextResponse.json({
    ok: true,
    settings: selected.settings,
    calendarId: selected.calendarId ?? null,
    isOverride: selected.isOverride,
    twilio,
    events,
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const calendarId = url.searchParams.get("calendarId");

  const body = await req.json().catch(() => ({}));
  const raw = body && typeof body === "object" ? (body as any).settings ?? body : null;
  const settings = parseAppointmentReminderSettings(raw);

  const next = await setAppointmentReminderSettingsForCalendar(ownerId, calendarId, settings);
  const [twilio, events] = await Promise.all([
    getOwnerTwilioSmsConfigMasked(ownerId),
    listAppointmentReminderEvents(ownerId, 50),
  ]);

  return NextResponse.json({ ok: true, settings: next, calendarId: calendarId ?? null, twilio, events });
}
