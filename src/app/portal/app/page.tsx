import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PortalDashboardClient } from "@/app/portal/PortalDashboardClient";
import { authOptions } from "@/lib/auth";

export default async function PortalAppHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">Your services, billing, and automation stats.</p>
        </div>
      </div>

      <div className="mt-6">
        <PortalDashboardClient />
      </div>
    </div>
  );
}
