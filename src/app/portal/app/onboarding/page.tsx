import { requirePortalUserForService } from "@/lib/portalAuth";
import { prisma } from "@/lib/db";
import { sendVerifyEmail } from "@/lib/portalEmailVerification.server";
import { PortalOnboardingClient } from "@/app/portal/app/onboarding/PortalOnboardingClient";
import { PortalVerifyEmailGate } from "@/app/portal/app/onboarding/PortalVerifyEmailGate";

export default async function PortalOnboardingPage() {
  const sessionUser = await requirePortalUserForService("businessProfile", "edit");
  const memberId = sessionUser.memberId || sessionUser.id;

  const me = await prisma.user.findUnique({
    where: { id: memberId },
    select: { email: true, emailVerifiedAt: true, emailVerificationEmailSentAt: true },
  });

  const email = String(me?.email || sessionUser.email || "").trim();
  const verified = Boolean(me?.emailVerifiedAt);

  if (!verified) {
    let emailSentAtIso = me?.emailVerificationEmailSentAt ? me.emailVerificationEmailSentAt.toISOString() : null;

    if (email && !me?.emailVerificationEmailSentAt) {
      const sentAt = new Date();
      await sendVerifyEmail({ userId: memberId, toEmail: email }).catch(() => null);
      emailSentAtIso = sentAt.toISOString();
    }

    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Quick setup</h1>
        <p className="mt-2 text-sm text-zinc-600">First, verify your email address.</p>

        <div className="mt-6">
          <PortalVerifyEmailGate email={email} emailVerificationEmailSentAt={emailSentAtIso} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Quick setup</h1>
      <p className="mt-2 text-sm text-zinc-600">
        A step-by-step checklist to get the portal working for you.
      </p>

      <div className="mt-6">
        <PortalOnboardingClient />
      </div>
    </div>
  );
}
