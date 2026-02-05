import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import {
  getFollowUpServiceData,
  parseFollowUpSettings,
  setFollowUpSettings,
} from "@/lib/followUpAutomation";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";

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
  const [data, calendars] = await Promise.all([
    getFollowUpServiceData(ownerId),
    getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1, calendars: [] })),
  ]);

  const builtinVariables = [
    "contactName",
    "contactEmail",
    "contactPhone",
    "businessName",
    "bookingTitle",
    "when",
    "timeZone",
    "startAt",
    "endAt",
  ];

  return NextResponse.json({
    ok: true,
    settings: data.settings,
    queue: data.queue.slice(0, 60),
    calendars: (calendars.calendars ?? []).map((c) => ({ id: c.id, title: c.title, enabled: Boolean(c.enabled) })),
    builtinVariables,
  });
}

const putSchema = z.object({ settings: z.unknown() });

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const normalized = parseFollowUpSettings(parsed.data.settings);
  const next = await setFollowUpSettings(ownerId, normalized);
  const data = await getFollowUpServiceData(ownerId);

  const calendars = await getBookingCalendarsConfig(ownerId).catch(() => ({ version: 1, calendars: [] }));
  const builtinVariables = [
    "contactName",
    "contactEmail",
    "contactPhone",
    "businessName",
    "bookingTitle",
    "when",
    "timeZone",
    "startAt",
    "endAt",
  ];

  return NextResponse.json({
    ok: true,
    settings: next,
    queue: data.queue.slice(0, 60),
    calendars: (calendars.calendars ?? []).map((c) => ({ id: c.id, title: c.title, enabled: Boolean(c.enabled) })),
    builtinVariables,
  });
}
