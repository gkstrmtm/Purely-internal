import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getBlogAppearance, setBlogAppearance } from "@/lib/blogAppearance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const updateSchema = z
  .object({
    useBrandFont: z.boolean().optional(),
    titleFontKey: z.string().trim().max(40).optional(),
    bodyFontKey: z.string().trim().max(40).optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const appearance = await getBlogAppearance(ownerId);
  return NextResponse.json({ ok: true, appearance });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const appearance = await setBlogAppearance(ownerId, parsed.data);
  return NextResponse.json({ ok: true, appearance });
}
