import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  createScopedPortalApiKey,
  listPortalApiKeys,
} from "@/lib/portalApiKeys.server";
import { PORTAL_API_KEY_PERMISSION_VALUES } from "@/lib/portalApiKeys.shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.enum(PORTAL_API_KEY_PERMISSION_VALUES as [string, ...string[]])).min(1),
  creditLimit: z.number().int().min(0).nullable().optional(),
});

export async function GET() {
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.access?.ownerId ?? auth.session.user.id;
  const payload = await listPortalApiKeys(ownerId);
  return NextResponse.json({ ok: true, ...payload });
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  try {
    const ownerId = auth.access?.ownerId ?? auth.session.user.id;
    const created = await createScopedPortalApiKey({
      ownerId,
      name: parsed.data.name,
      permissions: parsed.data.permissions as any,
      creditLimit: parsed.data.creditLimit ?? null,
    });
    return NextResponse.json({ ok: true, key: created.key, value: created.rawValue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create API key";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
