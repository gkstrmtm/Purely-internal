import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PortalBillingClient } from "@/app/portal/billing/PortalBillingClient";
import { authOptions } from "@/lib/auth";

export default async function PortalBillingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/portal/login");

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    redirect("/app");
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-ink">Billing</h1>
      <p className="mt-2 text-sm text-zinc-600">Manage your plan and payment method.</p>

      <div className="mt-6">
        <PortalBillingClient />
      </div>
    </div>
  );
}
