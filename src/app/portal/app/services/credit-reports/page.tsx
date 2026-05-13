import { redirectCreditOnlyService } from "@/app/portal/app/services/creditOnlyLegacyRedirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditReportsServicePage() {
  await redirectCreditOnlyService("/credit/app/services/credit-reports");
}
