import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientSessionForService("inbox");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalInboxSchema();

  const ownerId = auth.session.user.id;
  const { id } = await params;

  const row = await (prisma as any).portalInboxAttachment.findFirst({
    where: { id: String(id), ownerId },
    select: { id: true, messageId: true },
  });

  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (row.messageId) {
    return NextResponse.json(
      { ok: false, error: "This attachment is already sent." },
      { status: 400 },
    );
  }

  await (prisma as any).portalInboxAttachment.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
