import { NextResponse } from "next/server";
import { requireClientSession } from "@/lib/apiAuth";
import { listReviewRequestEvents } from "@/lib/reviewRequests";

export async function GET(req: Request) {
  const auth = await requireClientSession();
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
