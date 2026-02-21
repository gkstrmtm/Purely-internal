import { requireCreditClientSession } from "@/lib/creditPortalAccess";
import CreditReportsClient from "@/app/portal/app/services/credit-reports/CreditReportsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditReportsServicePage() {
  const session = await requireCreditClientSession();
  if (!session.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-xl font-semibold text-brand-ink">Credit Reports</h1>
        <p className="mt-2 text-sm text-zinc-600">Unauthorized.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit</div>
          <h1 className="text-2xl font-bold text-brand-ink">Credit Reports</h1>
          <p className="mt-1 text-sm text-zinc-600">Import and audit credit reports, and track disputed items.</p>
        </div>
        <CreditReportsClient />
      </div>
    </div>
  );
}
