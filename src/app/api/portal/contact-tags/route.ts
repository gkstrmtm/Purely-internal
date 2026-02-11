import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForAnyService } from "@/lib/portalAccess";
import { createOwnerContactTag, ensureOwnerContactTagsSeededFromLeadScrapingPresets, listOwnerContactTags } from "@/lib/portalContactTags";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const postSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .trim()
    .max(16)
    .optional()
    .nullable()
    .transform((v) => {
      if (v === null) return null;
      if (v === undefined) return null;
      return v === "" ? null : v;
    }),
});

export async function GET() {
  const auth = await requireClientSessionForAnyService([
    "inbox",
    "people",
    "automations",
    "newsletter",
    "nurtureCampaigns",
    "aiOutboundCalls",
  ]);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  await ensureOwnerContactTagsSeededFromLeadScrapingPresets(ownerId).catch(() => null);
  const tags = await listOwnerContactTags(ownerId);
  return NextResponse.json({ ok: true, tags });
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForAnyService(
    ["inbox", "people", "automations", "newsletter", "nurtureCampaigns", "aiOutboundCalls"],
    "edit",
  );
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const created = await createOwnerContactTag({
    ownerId,
    name: parsed.data.name,
    color: parsed.data.color,
  });

  if (!created) {
    return NextResponse.json({ ok: false, error: "Failed to create tag" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tag: created });
}
