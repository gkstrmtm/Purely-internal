import { redirect } from "next/navigation";

export default async function CreditServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service } = await params;
  redirect(`/credit/app/services/${service}`);
}
