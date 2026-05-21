import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getPortalAccountMemberRole } from "@/lib/portalAccounts";
import { prisma } from "@/lib/db";
import { sendPortalAccountInviteEmail } from "@/lib/portalAccountInviteEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_req: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireClientSessionForService("people", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const myRole = memberId === ownerId ? "OWNER" : await getPortalAccountMemberRole({ ownerId, userId: memberId });
  if (myRole !== "OWNER" && myRole !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  const inviteId = String(userId || "").trim();
  const invite = await (prisma as any).portalAccountInvite.findFirst({
    where: { id: inviteId, ownerId },
    select: {
      id: true,
      email: true,
      token: true,
      expiresAt: true,
      acceptedAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
  }

  if (invite.acceptedAt) {
    return NextResponse.json({ ok: false, error: "Invite already accepted" }, { status: 409 });
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "Invite expired" }, { status: 409 });
  }

  const emailResult = await sendPortalAccountInviteEmail({
    email: invite.email,
    token: invite.token,
    expiresAt: invite.expiresAt,
  });

  return NextResponse.json({
    ok: true,
    invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt, acceptedAt: invite.acceptedAt },
    link: emailResult.link,
    emailDelivery: emailResult.ok
      ? {
          ok: true,
          provider: emailResult.provider,
          providerMessageId: emailResult.providerMessageId,
        }
      : {
          ok: false,
          reason: emailResult.reason,
        },
  });
}
