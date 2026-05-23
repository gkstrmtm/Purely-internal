import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import { verifyPortalPasswordResetCode } from "@/lib/portalPasswordReset";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  code: z.string().trim().min(4).max(12),
});

export async function POST(req: Request) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = await verifyPortalPasswordResetCode({ ...parsed.data, variant });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}