import DisputeLettersClient from "@/app/credit/app/disputes/DisputeLettersClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditDisputeLettersEditorPage({
  params,
}: {
  params: Promise<{ letterId: string }>;
}) {
  const { letterId } = await params;

  return <DisputeLettersClient mode="editor" initialLetterId={letterId} />;
}