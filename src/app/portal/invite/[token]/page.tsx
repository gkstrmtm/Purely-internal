import { PortalInviteAcceptClient } from "@/app/portal/invite/[token]/PortalInviteAcceptClient";
import { findInviteByToken } from "@/lib/portalAccounts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findInviteByToken(token).catch(() => null);

  const inviteJson = invite
    ? {
        email: String(invite.email || ""),
        role: String(invite.role || "MEMBER"),
        expiresAtIso: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
        acceptedAtIso: invite.acceptedAt ? new Date(invite.acceptedAt).toISOString() : null,
      }
    : null;

  return <PortalInviteAcceptClient token={token} invite={inviteJson} />;
}
