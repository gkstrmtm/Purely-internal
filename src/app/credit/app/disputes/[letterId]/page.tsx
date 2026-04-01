import { redirect } from "next/navigation";

import { requireCreditClientSession } from "@/lib/creditPortalAccess";

import DisputeLettersClient from "../DisputeLettersClient";

export const dynamic = "force-dynamic";

export default async function CreditDisputeLetterEditorPage({
  params,
}: {
  params: Promise<{ letterId: string }>;
}) {
  const session = await requireCreditClientSession();
  if (!session.ok) redirect("/credit/login");

  const { letterId } = await params;
  return <DisputeLettersClient mode="editor" initialLetterId={letterId} />;
}
