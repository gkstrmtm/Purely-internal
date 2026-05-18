import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { hasPlatformAdminCapability } from "@/lib/internalCapabilities";
import { isPlatformAdminGranted } from "@/lib/platformAdminGrants";
import PortalDemoSeeder from "../PortalDemoSeeder";
import PortalTutorialVideosAdmin from "../PortalTutorialVideosAdmin";
import PortalTutorialPhotosAdmin from "../PortalTutorialPhotosAdmin";

export default async function ManagerAdminPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");
  const platformAdminGranted = await isPlatformAdminGranted(session.user.id).catch(() => false);
  const canAccessPlatformAdmin = hasPlatformAdminCapability(role, platformAdminGranted);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-ink">Admin</h1>
        <p className="mt-2 text-base text-zinc-600">
          Internal tools and notes for development and support.
        </p>

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Notes</div>
          <div className="mt-2 text-sm text-zinc-600">
            This area is intentionally a grab-bag for manager/admin-only utilities.
          </div>
        </div>

        {canAccessPlatformAdmin ? (
          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Platform admin</div>
            <div className="mt-2 text-sm text-zinc-600">
              Recoverability, permanent purge, and portal override controls stay under Platform Admin instead of the standard team-manager workflow.
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/app/manager/admin/recovery"
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-zinc-50"
              >
                Open Recovery Console
              </Link>
              <Link
                href="/app/manager/portal-overrides"
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-zinc-50"
              >
                Open Portal Overrides
              </Link>
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Portal tutorial videos</div>
          <div className="mt-2 text-sm text-zinc-600">
            Manage the video URL (or upload a video file) that appears at the top of each help &amp; tutorial page in the client portal.
          </div>
          <div className="mt-4">
            <PortalTutorialVideosAdmin />
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Portal tutorial photos</div>
          <div className="mt-2 text-sm text-zinc-600">
            Upload screenshots that appear inside each help &amp; tutorial page in the client portal.
          </div>
          <div className="mt-4">
            <PortalTutorialPhotosAdmin />
          </div>
        </div>

        <div className="mt-8">
          <PortalDemoSeeder />
        </div>
      </div>
    </div>
  );
}
