import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { normalizePortalContactCustomVarKey } from "@/lib/portalTemplateVars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const contactIdSchema = z.string().trim().min(1).max(120);

const patchSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string().optional().default(""),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const params = await ctx.params;
  const contactId = contactIdSchema.safeParse(params.contactId);
  if (!contactId.success) {
    return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  const key = normalizePortalContactCustomVarKey(parsed.data.key);
  if (!key) {
    return NextResponse.json({ ok: false, error: "Invalid key" }, { status: 400 });
  }

  const value = String(parsed.data.value ?? "").trim();

  const existing = await prisma.portalContact
    .findFirst({ where: { ownerId, id: contactId.data }, select: { id: true, customVariables: true } })
    .catch(() => null);

  if (!existing?.id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const base: Record<string, string> =
    existing.customVariables && typeof existing.customVariables === "object" && !Array.isArray(existing.customVariables)
      ? ({ ...(existing.customVariables as Record<string, string>) } as Record<string, string>)
      : {};

  if (!value) {
    delete base[key];
  } else {
    base[key] = value;
  }

  const customVariablesUpdate: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = Object.keys(base).length
    ? (base as Prisma.InputJsonValue)
    : Prisma.DbNull;

  await prisma.portalContact.updateMany({
    where: { ownerId, id: contactId.data },
    data: { customVariables: customVariablesUpdate },
  });

  return NextResponse.json({ ok: true, key, value });
}
