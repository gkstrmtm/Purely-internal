import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { runOwnerAutomationByIdForEvent } from "@/lib/portalAutomationsRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    automationId: z.string().min(1).max(80),
    contact: z
      .object({
        id: z.string().max(80).optional(),
        name: z.string().max(200).optional(),
        email: z.string().max(200).optional(),
        phone: z.string().max(32).optional(),
      })
      .optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("automations", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await runOwnerAutomationByIdForEvent({
    ownerId,
    automationId: parsed.data.automationId,
    triggerKind: "manual",
    contact: parsed.data.contact,
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
