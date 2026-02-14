import { NextResponse } from "next/server";
import { z } from "zod";

import { createAndSendPortalPasswordResetCode } from "@/lib/portalPasswordReset";

const bodySchema = z.object({
  email: z.string().trim().email().max(200),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  try {
    await createAndSendPortalPasswordResetCode({ email: parsed.data.email });
  } catch {
    // Best-effort and non-enumerating.
  }

  return NextResponse.json({ ok: true });
}
