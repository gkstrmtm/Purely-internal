import DisputeLettersClient from "@/app/credit/app/disputes/DisputeLettersClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CreditDisputeLettersServicePage() {
  return <DisputeLettersClient mode="list" />;
}