import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CreditDisputeLetterEditorPage({
  params,
}: {
  params: Promise<{ letterId: string }>;
}) {
  const { letterId } = await params;
  redirect(`/credit/app/services/dispute-letters/${encodeURIComponent(letterId)}`);
}
