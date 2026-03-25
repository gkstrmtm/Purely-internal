import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { clampPortalReportingRangeKey, getPortalReportingSummaryForOwner } from "@/lib/portalReportingSummary.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("reporting");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const range = clampPortalReportingRangeKey(url.searchParams.get("range"));
  const payload = await getPortalReportingSummaryForOwner(ownerId, range);
  return NextResponse.json(payload);
}
