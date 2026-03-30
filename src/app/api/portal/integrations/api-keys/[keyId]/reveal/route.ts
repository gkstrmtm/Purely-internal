import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { revealPortalApiKey } from "@/lib/portalApiKeys.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_req: Request, context: { params: Promise<{ keyId: string }> }) {
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  try {
    const ownerId = auth.access?.ownerId ?? auth.session.user.id;
    const { keyId } = await context.params;
    const value = await revealPortalApiKey(ownerId, keyId);
    return NextResponse.json({ ok: true, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reveal API key";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
