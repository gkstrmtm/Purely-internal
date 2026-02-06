import { NextResponse } from "next/server";
import { requireClientSession } from "@/lib/apiAuth";
import { getReviewRequestsServiceData, parseReviewRequestsSettings, setReviewRequestsSettings } from "@/lib/reviewRequests";

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const data = await getReviewRequestsServiceData(ownerId);
  return NextResponse.json({ ok: true, settings: data.settings });
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
  const body = await req.json().catch(() => null);
  const settings = parseReviewRequestsSettings(body?.settings);
  const saved = await setReviewRequestsSettings(ownerId, settings);
  return NextResponse.json({ ok: true, settings: saved });
}
