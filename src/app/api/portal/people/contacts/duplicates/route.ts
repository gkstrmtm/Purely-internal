import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { listDuplicatePortalContactsByPhoneKey } from "@/lib/portalContactDedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("people");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const limitGroups = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 100) || 100));
  const summaryOnly = url.searchParams.get("summary") === "1";

  const res = await listDuplicatePortalContactsByPhoneKey({ ownerId, limitGroups });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });

  if (summaryOnly) {
    const groups = res.groups;
    const groupsNeedingChoice = groups.filter((g) => g.needsEmailChoice).length;
    const totalDuplicateContacts = groups.reduce((sum, g) => sum + g.contacts.length, 0);
    return NextResponse.json({ ok: true, groupsCount: groups.length, groupsNeedingChoice, totalDuplicateContacts });
  }

  return NextResponse.json({ ok: true, groups: res.groups });
}
