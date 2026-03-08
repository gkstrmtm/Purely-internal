import { NextResponse } from "next/server";

import { requireClientSessionForAnyService } from "@/lib/portalAccess";
import { listPortalAccountRecipientContacts } from "@/lib/portalNotifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForAnyService([
    "profile",
    "booking",
    "inbox",
    "tasks",
    "automations",
    "blogs",
    "newsletter",
    "reviews",
  ]);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const contacts = await listPortalAccountRecipientContacts(ownerId).catch(() => []);

  return NextResponse.json({ ok: true, recipients: contacts });
}
