import { StencilPageShell } from "../../_shared/primitives";
import { FAQSection } from "../sections/FAQSection";
import { GuaranteeSection } from "../sections/GuaranteeSection";
import { PricingTable } from "../sections/PricingTable";

export function OfferPage() {
  return (
    <StencilPageShell>
      <PricingTable />
      <GuaranteeSection />
      <FAQSection />
    </StencilPageShell>
  );
}
