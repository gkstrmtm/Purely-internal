import { NextResponse } from "next/server";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getPortalBusinessProfile, upsertPortalBusinessProfile } from "@/lib/portalBusinessProfile.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("businessProfile", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const result = await getPortalBusinessProfile({ ownerId });
  return NextResponse.json(result.json, { status: result.status });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const result = await upsertPortalBusinessProfile({ ownerId, body });
  return NextResponse.json(result.json, { status: result.status });
}
