import { redirectCreditOnlyService } from "@/app/portal/app/services/creditOnlyLegacyRedirect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditDisputeLettersServicePage() {
  await redirectCreditOnlyService("/credit/app/services/dispute-letters");
}
