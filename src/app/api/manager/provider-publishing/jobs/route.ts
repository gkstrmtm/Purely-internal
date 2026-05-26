import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdminSession } from "@/lib/apiAuth";
import { listProviderPublishingAdminRecords, type ProviderJobAdminState } from "@/lib/portalMediaPublishingAdmin.server";
import { platformAdminAuthError } from "@/lib/platformAdminGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const stateSchema = z.enum(["queued", "pending", "blocked", "failed", "published", "manual_only"] satisfies ProviderJobAdminState[]);

const querySchema = z.object({
  state: stateSchema.optional(),
  ownerQuery: z.string().trim().max(200).optional(),
  query: z.string().trim().max(200).optional(),
  take: z.string().trim().max(4).optional(),
});

export async function GET(req: Request) {
  const auth = await requirePlatformAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: platformAdminAuthError(auth.status) }, { status: auth.status });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    state: url.searchParams.get("state") ?? undefined,
    ownerQuery: url.searchParams.get("ownerQuery") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }

  const records = await listProviderPublishingAdminRecords({
    state: parsed.data.state ?? null,
    ownerQuery: parsed.data.ownerQuery ?? null,
    query: parsed.data.query ?? null,
    take: parsed.data.take ? Number.parseInt(parsed.data.take, 10) : 200,
  });

  return NextResponse.json({
    ok: true,
    records,
    counts: {
      queued: records.filter((record) => record.state === "queued").length,
      pending: records.filter((record) => record.state === "pending").length,
      blocked: records.filter((record) => record.state === "blocked").length,
      failed: records.filter((record) => record.state === "failed").length,
      published: records.filter((record) => record.state === "published").length,
      manual_only: records.filter((record) => record.state === "manual_only").length,
    },
  });
}
