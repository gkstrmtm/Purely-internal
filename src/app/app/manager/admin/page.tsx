import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import PortalDemoSeeder from "../PortalDemoSeeder";
import PortalTutorialVideosAdmin from "../PortalTutorialVideosAdmin";

export default async function ManagerAdminPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");

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

        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Portal tutorial videos</div>
          <div className="mt-2 text-sm text-zinc-600">
            Manage the video links that appear at the top of each help &amp; tutorial page in the client portal.
          </div>
          <div className="mt-4">
            <PortalTutorialVideosAdmin />
          </div>
        </div>

        <div className="mt-8">
          <PortalDemoSeeder />
        </div>
      </div>
    </div>
  );
}
