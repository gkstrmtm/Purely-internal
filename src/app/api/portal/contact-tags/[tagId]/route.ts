import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { deleteOwnerContactTag, updateOwnerContactTag } from "@/lib/portalContactTags";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const tagIdSchema = z.string().trim().min(1).max(120);

const patchSchema = z
  .object({
    name: z.string().trim().max(60).optional(),
    color: z
      .string()
      .trim()
      .max(16)
      .optional()
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, { message: "No changes" });

export async function PATCH(req: Request, ctx: { params: Promise<{ tagId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const tagId = tagIdSchema.safeParse(params.tagId);
  if (!tagId.success) return NextResponse.json({ ok: false, error: "Invalid tag id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await updateOwnerContactTag({ ownerId, tagId: tagId.data, ...parsed.data });
  if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, tag: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ tagId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const tagId = tagIdSchema.safeParse(params.tagId);
  if (!tagId.success) return NextResponse.json({ ok: false, error: "Invalid tag id" }, { status: 400 });

  const ok = await deleteOwnerContactTag(ownerId, tagId.data);
  if (!ok) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
