import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { hasPlatformAdminCapability } from "@/lib/internalCapabilities";
import { isPlatformAdminGranted } from "@/lib/platformAdminGrants";

import { RecoveryConsoleClient } from "./RecoveryConsoleClient";

export default async function PlatformAdminRecoveryPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const platformAdminGranted = await isPlatformAdminGranted(session.user.id).catch(() => false);
  if (!hasPlatformAdminCapability(session.user.role, platformAdminGranted)) redirect("/app");

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-500">Platform admin</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink">Recovery console</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600 sm:text-base">
              Search archived records, review safe metadata, and restore one record at a time with an explicit reason.
            </p>
          </div>

          <Link
            href="/app/manager/admin"
            className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-zinc-50"
          >
            Back to Admin
          </Link>
        </div>

        <div className="mt-8">
          <RecoveryConsoleClient />
        </div>
      </div>
    </div>
  );
}