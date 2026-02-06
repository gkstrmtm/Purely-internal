import { NextResponse } from "next/server";

import { processDueAppointmentReminders } from "@/lib/appointmentReminders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.BOOKING_REMINDERS_CRON_SECRET;
  if (isProd && !secret) {
    return NextResponse.json({ error: "Missing BOOKING_REMINDERS_CRON_SECRET" }, { status: 503 });
  }

  if (secret) {
    const url = new URL(req.url);
    const authz = req.headers.get("authorization") ?? "";
    const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null;
    const provided = req.headers.get("x-booking-reminders-cron-secret") ?? bearer ?? url.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await processDueAppointmentReminders({ ownersLimit: 2000, perOwnerLimit: 25, windowMinutes: 5 });
  return NextResponse.json(result);
}
