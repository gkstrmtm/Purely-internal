import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { clampSalesRangeKey, getSalesReportForOwner } from "@/lib/salesReportingReport.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("reporting", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const url = new URL(req.url);
  const range = clampSalesRangeKey(url.searchParams.get("range"));

  const payload = await getSalesReportForOwner(ownerId, range);
  if (!payload.ok) {
    return NextResponse.json(payload, { status: 400 });
  }

  return NextResponse.json(payload);
}
