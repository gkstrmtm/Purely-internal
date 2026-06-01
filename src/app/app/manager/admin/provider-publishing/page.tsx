import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { hasPlatformAdminCapability } from "@/lib/internalCapabilities";
import { isPlatformAdminGranted } from "@/lib/platformAdminGrants";

import { ProviderPublishingAdminClient } from "./ProviderPublishingAdminClient";

export default async function PlatformAdminProviderPublishingPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const platformAdminGranted = await isPlatformAdminGranted(session.user.id).catch(() => false);
  if (!hasPlatformAdminCapability(session.user.role, platformAdminGranted)) redirect("/app");

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-500">Platform admin</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink">Provider publishing queue</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">
              Inspect queued, blocked, failed, published, and manual-only provider jobs without touching the customer-facing Media Library workflow.
            </p>
          </div>

          <Link
            href="/app/manager/admin"
            className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-zinc-50"
          >
            Back to Platform Admin
          </Link>
        </div>

        <div className="mt-8">
          <ProviderPublishingAdminClient />
        </div>
      </div>
    </div>
  );
}
