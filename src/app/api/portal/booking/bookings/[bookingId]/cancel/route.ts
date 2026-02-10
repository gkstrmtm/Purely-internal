import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { cancelFollowUpsForBooking } from "@/lib/followUpAutomation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function sendEmail({
  to,
  subject,
  body,
  fromName,
}: {
  to: string[];
  subject: string;
  body: string;
  fromName?: string;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromEmail) return;
  if (!to.length) return;

  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: to.map((email) => ({ email })) }],
      from: { email: fromEmail, name: fromName ?? "Purely Automation" },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  }).catch(() => null);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const auth = await requireClientSessionForService("booking");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const { bookingId } = await params;
  const ownerId = auth.session.user.id;

  const site = await prisma.portalBookingSite.findUnique({
    where: { ownerId },
    select: { id: true, title: true, timeZone: true },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const booking = await prisma.portalBooking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.siteId !== site.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (booking.status !== "SCHEDULED") {
    return NextResponse.json({ ok: true, booking });
  }

  const updated = await prisma.portalBooking.update({
    where: { id: bookingId },
    data: { status: "CANCELED", canceledAt: new Date() },
  });

  // Best-effort follow-up cancellation (never block a successful cancel).
  try {
    await cancelFollowUpsForBooking(String(ownerId), String(updated.id));
  } catch {
    // ignore
  }

  // Best-effort customer notification when SendGrid env vars exist.
  try {
    if (updated.contactEmail) {
      const profile = await prisma.businessProfile.findUnique({
        where: { ownerId },
        select: { businessName: true },
      });
      const fromName = profile?.businessName?.trim() || "Purely Automation";
      const when = new Intl.DateTimeFormat(undefined, {
        timeZone: site.timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(updated.startAt));

      const body = [
        `Your booking was canceled: ${site.title}`,
        "",
        `When: ${when} (${site.timeZone})`,
        "",
        "If you have questions, reply to this email.",
      ].join("\n");

      await sendEmail({
        to: [updated.contactEmail],
        subject: `Booking canceled: ${site.title}`,
        body,
        fromName,
      });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, booking: updated });
}
