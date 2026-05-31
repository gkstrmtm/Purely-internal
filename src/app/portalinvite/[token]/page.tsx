import { PortalInviteAcceptClient } from "@/app/portal/invite/[token]/PortalInviteAcceptClient";
import { findInviteByToken } from "@/lib/portalAccounts";
import { normalizePortalVariant } from "@/lib/portalVariant";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortalInviteShortlinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const rawSearchParams = searchParams ? await searchParams : undefined;
  const portalVariant = normalizePortalVariant(
    Array.isArray(rawSearchParams?.variant) ? rawSearchParams?.variant[0] : rawSearchParams?.variant,
  ) || "portal";
  const invite = await findInviteByToken(token).catch(() => null);

  const inviteJson = invite
    ? {
        email: String(invite.email || ""),
        role: String(invite.role || "MEMBER"),
        expiresAtIso: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
        acceptedAtIso: invite.acceptedAt ? new Date(invite.acceptedAt).toISOString() : null,
      }
    : null;

  return <PortalInviteAcceptClient token={token} invite={inviteJson} portalVariant={portalVariant} />;
}
