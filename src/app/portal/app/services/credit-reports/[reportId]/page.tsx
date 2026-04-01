import CreditReportsClient from "@/app/portal/app/services/credit-reports/CreditReportsClient";
import { requireCreditClientSession } from "@/lib/creditPortalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditReportsDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await requireCreditClientSession();
  const { reportId } = await params;

  if (!session.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-xl font-semibold text-brand-ink">Credit Reports</h1>
        <p className="mt-2 text-sm text-zinc-600">Unauthorized.</p>
      </div>
    );
  }

  return <CreditReportsClient mode="detail" initialReportId={reportId} />;
}
