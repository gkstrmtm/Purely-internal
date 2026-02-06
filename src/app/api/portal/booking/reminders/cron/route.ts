import { NextResponse } from "next/server";

import { processDueAppointmentReminders } from "@/lib/appointmentReminders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const secret = process.env.BOOKING_REMINDERS_CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-booking-reminders-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await processDueAppointmentReminders({ ownersLimit: 2000, perOwnerLimit: 25, windowMinutes: 5 });
  return NextResponse.json(result);
}
