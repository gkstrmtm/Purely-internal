import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { normalizePortalContactCustomVarKey } from "@/lib/portalTemplateVars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isMissingRelationError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /does not exist|relation .* does not exist|no such table/i.test(msg);
}

export async function GET() {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  try {
    const rows = await prisma.$queryRaw<Array<{ key: string | null }>>`
      SELECT DISTINCT jsonb_object_keys("customVariables") AS key
      FROM "PortalContact"
      WHERE "ownerId" = ${ownerId}
        AND "customVariables" IS NOT NULL
        AND jsonb_typeof("customVariables") = 'object'
      LIMIT 250;
    `;

    const out: string[] = [];
    const seen = new Set<string>();
    for (const r of rows || []) {
      const key = normalizePortalContactCustomVarKey(String(r?.key ?? ""));
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= 50) break;
    }

    out.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ ok: true, keys: out });
  } catch (e) {
    if (isMissingRelationError(e)) {
      return NextResponse.json({ ok: true, keys: [] });
    }
    return NextResponse.json({ ok: true, keys: [] });
  }
}
