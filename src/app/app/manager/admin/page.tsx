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
  const platformAdminGranted = await isPlatformAdminGranted(session.user.id).catch(() => false);
  if (!hasPlatformAdminCapability(role, platformAdminGranted)) redirect("/app");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-ink">Platform admin</h1>
        <p className="mt-2 text-base text-zinc-600">
          Account, content, and support tools for the client platform.
        </p>

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Scope</div>
          <div className="mt-2 text-sm text-zinc-600">
            Use this area for platform operations only. Internal team management stays in the main manager workspace.
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Platform account ops</div>
          <div className="mt-2 text-sm text-zinc-600">
            Platform-only account tools live here instead of the main manager workflow nav.
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/app/manager/portal-overrides"
              className="inline-flex items-center rounded-full border border-brand-blue/20 bg-brand-blue/5 px-4 py-2 text-sm font-medium text-brand-blue transition hover:border-brand-blue/40 hover:bg-brand-blue/10"
            >
              Open Portal Overrides
            </Link>
            <Link
              href="/app/manager/admin/recovery"
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-zinc-50"
            >
              Open Recovery Console
            </Link>
            <Link
              href="/app/manager/admin/provider-publishing"
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-zinc-50"
            >
              Open Provider Queue View
            </Link>
          </div>
        </div>

        {role === "ADMIN" ? (
          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-base font-semibold text-brand-ink">Internal access control</div>
            <div className="mt-2 text-sm text-zinc-600">
              Grant or revoke platform-admin access from the employee management flow instead of onboarding invites.
            </div>
            <div className="mt-4">
              <Link
                href="/app/hr/employees"
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-zinc-50"
              >
                Manage employee access
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
