import { NextResponse } from "next/server";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { listReviewRequestEvents } from "@/lib/reviewRequests";

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("reviews");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || "50");
  const events = await listReviewRequestEvents(ownerId, limit);
  return NextResponse.json({ ok: true, events });
}
