import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOwnerMailboxAddressForUi, updateOwnerMailboxLocalPartOnce } from "@/lib/portalMailbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("profile");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const mailbox = await getOwnerMailboxAddressForUi(ownerId).catch(() => null);
  const canChange = auth.access?.memberRole === "OWNER" ? Boolean(mailbox?.canChange) : false;

  return NextResponse.json({
    ok: true,
    mailbox: mailbox
      ? {
          emailAddress: mailbox.emailAddress,
          localPart: mailbox.localPart,
          canChange,
        }
      : null,
  });
}

const putSchema = z.object({ localPart: z.string().trim().min(2).max(48) });

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("profile");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (auth.access?.memberRole !== "OWNER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const res = await updateOwnerMailboxLocalPartOnce({ ownerId, desiredLocalPart: parsed.data.localPart });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, mailbox: { emailAddress: res.emailAddress, localPart: res.localPart, canChange: false } });
}
