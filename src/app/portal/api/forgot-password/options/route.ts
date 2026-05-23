import { NextResponse } from "next/server";

import { getPortalPasswordResetChannels } from "@/lib/portalPasswordReset";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email : "";
    const variant = normalizePortalVariant(req.headers.get(PORTAL_VARIANT_HEADER)) || undefined;
    const result = await getPortalPasswordResetChannels({ email, variant });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 404 });
    }
    return NextResponse.json({ ok: true, channels: result.channels });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to continue" }, { status: 500 });
  }
}