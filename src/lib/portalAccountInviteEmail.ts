import { trySendTransactionalEmail } from "@/lib/emailSender";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";
import type { PortalVariant } from "@/lib/portalVariant";

type PortalInviteEmailResult =
  | {
      ok: true;
      provider: string;
      providerMessageId: string | null;
      link: string;
    }
  | {
      ok: false;
      reason: string;
      link: string;
    };

export async function sendPortalAccountInviteEmail(input: {
  email: string;
  token: string;
  expiresAt: string | Date;
  portalVariant?: PortalVariant;
}): Promise<PortalInviteEmailResult> {
  const email = String(input.email || "").trim().toLowerCase();
  const token = String(input.token || "").trim();
  const portalVariant = input.portalVariant === "credit" ? "credit" : "portal";
  const link = toPurelyHostedUrl(`/portalinvite/${token}?variant=${portalVariant}`);
  const subject = portalVariant === "credit" ? "Your Purely Credit portal is ready" : "You’ve been invited to Purely Automation";
  const text =
    portalVariant === "credit"
      ? `Your Purely Credit client portal is ready. Use the secure link below to create your password and review your progress.\n\nCreate your login: ${link}\n\nThis secure link expires on ${new Date(input.expiresAt).toLocaleString()}.`
      : `You’ve been invited to access a Purely Automation client portal.\n\nAccept invite: ${link}\n\nThis invite expires on ${new Date(input.expiresAt).toLocaleString()}.`;

  const sendResult = await trySendTransactionalEmail({
    to: email,
    subject,
    text,
  });

  if (!sendResult.ok) {
    return {
      ok: false,
      reason: sendResult.reason,
      link,
    };
  }

  return {
    ok: true,
    provider: sendResult.provider,
    providerMessageId: sendResult.providerMessageId,
    link,
  };
}