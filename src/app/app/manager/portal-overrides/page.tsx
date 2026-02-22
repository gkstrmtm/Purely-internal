import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import PortalOverridesClient from "./PortalOverridesClient";

export default async function ManagerPortalOverridesPage() {
  const session = await getServerSession(authOptions).catch(() => null);
  if (!session?.user) redirect("/employeelogin");

  const role = session.user.role;
  if (role !== "MANAGER" && role !== "ADMIN") redirect("/app");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Portal overrides</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Grant portal services for free. Overrides behave like paid entitlements.
        </p>
        <div className="mt-6">
          <PortalOverridesClient />
        </div>
      </div>
    </div>
  );
}
