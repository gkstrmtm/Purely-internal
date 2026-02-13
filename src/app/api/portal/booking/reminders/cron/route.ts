import { NextResponse } from "next/server";

import { processDueAppointmentReminders } from "@/lib/appointmentReminders";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.BOOKING_REMINDERS_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ error: "Missing BOOKING_REMINDERS_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-booking-reminders-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDueAppointmentReminders({ ownersLimit: 2000, perOwnerLimit: 25, windowMinutes: 5 });
  return NextResponse.json(result);
}
