import { DiscountCheckoutClient } from "@/app/portal/app/discount/DiscountCheckoutClient";

export const dynamic = "force-dynamic";

export default async function CreditDiscountPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ promoCode?: string; campaignId?: string }>;
}) {
  const { serviceSlug } = await params;
  const sp = await searchParams;
  const promoCode = typeof sp?.promoCode === "string" ? sp.promoCode : null;
  const campaignId = typeof sp?.campaignId === "string" ? sp.campaignId : null;

  return <DiscountCheckoutClient basePath="/credit" serviceSlug={serviceSlug} promoCode={promoCode} campaignId={campaignId} />;
}
