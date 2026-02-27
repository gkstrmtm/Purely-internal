import { DiscountCheckoutClient } from "../DiscountCheckoutClient";

export const dynamic = "force-dynamic";

export default async function PortalDiscountPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ promoCode?: string }>;
}) {
  const { serviceSlug } = await params;
  const sp = await searchParams;
  const promoCode = typeof sp?.promoCode === "string" ? sp.promoCode : null;

  return <DiscountCheckoutClient basePath="/portal" serviceSlug={serviceSlug} promoCode={promoCode} />;
}
