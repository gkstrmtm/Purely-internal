import { NextResponse } from "next/server";

import { getPortalPasswordResetChannels } from "@/lib/portalPasswordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email : "";
    const result = await getPortalPasswordResetChannels({ email, variant: "credit" });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 404 });
    }
    return NextResponse.json({ ok: true, channels: result.channels });
  } catch {
    return NextResponse.json({ ok: false, error: "Reset options did not load. Retry from sign in." }, { status: 500 });
  }
}