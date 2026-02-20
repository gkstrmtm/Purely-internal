import { redirect } from "next/navigation";

import { requireCreditClientSession } from "@/lib/creditPortalAccess";

import DisputeLettersClient from "./DisputeLettersClient";

export const dynamic = "force-dynamic";

export default async function CreditDisputesPage() {
  const session = await requireCreditClientSession();
  if (!session.ok) redirect("/credit/login");

  return <DisputeLettersClient />;
}
