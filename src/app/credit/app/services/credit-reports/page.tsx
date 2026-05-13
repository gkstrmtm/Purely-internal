import CreditReportsClient from "@/app/portal/app/services/credit-reports/CreditReportsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CreditReportsServicePage() {
  return <CreditReportsClient mode="list" />;
}