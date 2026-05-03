import { StencilPageShell } from "../../_shared/primitives";
import { FAQSection } from "../sections/FAQSection";
import { NextStepPanel } from "../sections/NextStepPanel";

export function OfferPage() {
  return (
    <StencilPageShell>
      <FAQSection />
      <NextStepPanel />
    </StencilPageShell>
  );
}
