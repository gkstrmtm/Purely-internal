import { StencilPageShell } from "../../_shared/primitives";
import { BenefitsSection } from "../sections/BenefitsSection";
import { CTASection } from "../sections/CTASection";
import { CountdownOffer } from "../sections/CountdownOffer";
import { GuaranteeSection } from "../sections/GuaranteeSection";
import { Hero } from "../sections/Hero";
import { ProofStrip } from "../sections/ProofStrip";

export function LandingPage() {
  return (
    <StencilPageShell>
      <Hero />
      <CountdownOffer />
      <ProofStrip />
      <BenefitsSection />
      <GuaranteeSection />
      <CTASection />
    </StencilPageShell>
  );
}
