import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { mergePortalContacts } from "@/lib/portalContactDedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    primaryContactId: z.string().min(1).max(80),
    mergeContactIds: z.array(z.string().min(1).max(80)).min(1).max(50),
    primaryEmail: z.string().max(200).optional().nullable(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const res = await mergePortalContacts({
    ownerId,
    primaryContactId: parsed.data.primaryContactId,
    mergeContactIds: parsed.data.mergeContactIds,
    primaryEmail: parsed.data.primaryEmail ?? null,
  });

  if (!res.ok) {
    const status = res.code === "EMAIL_CONFLICT" ? 409 : res.code === "PHONE_MISMATCH" ? 400 : 400;
    return NextResponse.json({ ok: false, error: res.error, code: res.code, details: res.details }, { status });
  }

  return NextResponse.json(res);
}
