import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import { createAndSendPortalPasswordResetCode } from "@/lib/portalPasswordReset";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
});

export async function POST(req: Request) {
  const h = await headers();
  const variant = normalizePortalVariant(h.get(PORTAL_VARIANT_HEADER)) || "portal";

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  try {
    await createAndSendPortalPasswordResetCode({ email: parsed.data.email, variant });
  } catch {
    // Best-effort and non-enumerating.
  }

  return NextResponse.json({ ok: true });
}
