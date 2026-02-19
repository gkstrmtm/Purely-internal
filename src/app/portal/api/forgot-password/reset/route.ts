import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import { resetPortalPasswordWithCode } from "@/lib/portalPasswordReset";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  code: z.string().trim().min(4).max(12),
  newPassword: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const r = await resetPortalPasswordWithCode({ ...parsed.data, variant });
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
