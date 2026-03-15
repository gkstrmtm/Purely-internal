import { requirePortalUserForService } from "@/lib/portalAuth";
import { prisma } from "@/lib/db";
import { sendVerifyEmail } from "@/lib/portalEmailVerification.server";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";
import { PortalOnboardingClient } from "@/app/portal/app/onboarding/PortalOnboardingClient";
import { PortalVerifyEmailGate } from "@/app/portal/app/onboarding/PortalVerifyEmailGate";

export default async function PortalOnboardingPage() {
  const sessionUser = await requirePortalUserForService("businessProfile", "edit");
  const memberId = sessionUser.memberId || sessionUser.id;

  const [hasEmailVerifiedAt, hasEmailSentAt] = await Promise.all([
    dbHasPublicColumn({ tableNames: ["User", "user"], columnName: "emailVerifiedAt" }).catch(() => false),
    dbHasPublicColumn({ tableNames: ["User", "user"], columnName: "emailVerificationEmailSentAt" }).catch(() => false),
  ]);

  const select: Record<string, boolean> = { email: true };
  if (hasEmailVerifiedAt) select.emailVerifiedAt = true;
  if (hasEmailSentAt) select.emailVerificationEmailSentAt = true;

  const me = await prisma.user.findUnique({ where: { id: memberId }, select: select as any }).catch(() => null);

  const email = String(me?.email || sessionUser.email || "").trim();

  // If the DB doesn’t yet have verification columns (schema drift), don’t hard-crash
  // and don’t block onboarding.
  const verified = hasEmailVerifiedAt ? Boolean((me as any)?.emailVerifiedAt) : true;

  if (!verified) {
    let emailSentAtIso = hasEmailSentAt && (me as any)?.emailVerificationEmailSentAt
      ? new Date((me as any).emailVerificationEmailSentAt).toISOString()
      : null;

    if (email && (!hasEmailSentAt || !(me as any)?.emailVerificationEmailSentAt)) {
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
