import { NextResponse } from "next/server";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { sendReviewRequestForBooking } from "@/lib/reviewRequests";

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("reviews");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = await req.json().catch(() => null);
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
  const result = await sendReviewRequestForBooking({ ownerId, bookingId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
