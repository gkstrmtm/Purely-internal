import { trySendTransactionalEmail } from "@/lib/emailSender";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

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
}): Promise<PortalInviteEmailResult> {
  const email = String(input.email || "").trim().toLowerCase();
  const token = String(input.token || "").trim();
  const link = toPurelyHostedUrl(`/portalinvite/${token}`);

  const sendResult = await trySendTransactionalEmail({
    to: email,
    subject: "You’ve been invited to Purely Automation",
    text: `You’ve been invited to access a Purely Automation client portal.\n\nAccept invite: ${link}\n\nThis invite expires on ${new Date(input.expiresAt).toLocaleString()}.`,
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