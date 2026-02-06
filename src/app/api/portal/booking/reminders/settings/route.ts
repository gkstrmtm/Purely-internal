import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import {
  getAppointmentRemindersServiceData,
  listAppointmentReminderEvents,
  parseAppointmentReminderSettings,
  setAppointmentReminderSettings,
} from "@/lib/appointmentReminders";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const [data, twilio, events] = await Promise.all([
    getAppointmentRemindersServiceData(ownerId),
    getOwnerTwilioSmsConfigMasked(ownerId),
    listAppointmentReminderEvents(ownerId, 50),
  ]);

  return NextResponse.json({ ok: true, settings: data.settings, twilio, events });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = await req.json().catch(() => ({}));
  const raw = body && typeof body === "object" ? (body as any).settings ?? body : null;
  const settings = parseAppointmentReminderSettings(raw);

  const next = await setAppointmentReminderSettings(ownerId, settings);
  const [twilio, events] = await Promise.all([
    getOwnerTwilioSmsConfigMasked(ownerId),
    listAppointmentReminderEvents(ownerId, 50),
  ]);

  return NextResponse.json({ ok: true, settings: next, twilio, events });
}
