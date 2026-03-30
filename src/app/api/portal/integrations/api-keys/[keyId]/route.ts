import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { deletePortalApiKey, updateScopedPortalApiKey } from "@/lib/portalApiKeys.server";
import { PORTAL_API_KEY_PERMISSION_VALUES } from "@/lib/portalApiKeys.shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    permissions: z.array(z.enum(PORTAL_API_KEY_PERMISSION_VALUES as [string, ...string[]])).min(1).optional(),
    creditLimit: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request, context: { params: Promise<{ keyId: string }> }) {
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  try {
    const ownerId = auth.access?.ownerId ?? auth.session.user.id;
    const { keyId } = await context.params;
    const key = await updateScopedPortalApiKey({
      ownerId,
      keyId,
      name: parsed.data.name,
      permissions: parsed.data.permissions as any,
      creditLimit: parsed.data.creditLimit,
    });
    return NextResponse.json({ ok: true, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update API key";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ keyId: string }> }) {
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
    await deletePortalApiKey(ownerId, keyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete API key";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
