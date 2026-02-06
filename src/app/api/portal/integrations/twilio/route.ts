import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { getOwnerTwilioSmsConfigMasked, setOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const twilio = await getOwnerTwilioSmsConfigMasked(ownerId);

  return NextResponse.json({ ok: true, twilio });
}

const putSchema = z.object({
  accountSid: z.string().trim().min(6).max(80).optional(),
  authToken: z.string().trim().min(6).max(120).optional(),
  fromNumberE164: z.string().trim().max(32).optional(),
  clear: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  try {
    const twilio = await setOwnerTwilioSmsConfig(ownerId, parsed.data);
    return NextResponse.json({ ok: true, twilio, note: parsed.data.clear ? "Cleared." : "Saved." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
  }
}
