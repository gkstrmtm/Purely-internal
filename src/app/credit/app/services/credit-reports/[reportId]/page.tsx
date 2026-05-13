import CreditReportsClient from "@/app/portal/app/services/credit-reports/CreditReportsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditReportsDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;

  return <CreditReportsClient mode="detail" initialReportId={reportId} />;
}