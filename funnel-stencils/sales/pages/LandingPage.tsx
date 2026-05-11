import { StencilPageShell } from "../../_shared/primitives";
import { BenefitsSection } from "../sections/BenefitsSection";
import { CTASection } from "../sections/CTASection";
import { FeatureGrid } from "../sections/FeatureGrid";
import { Hero } from "../sections/Hero";
import { ProofStrip } from "../sections/ProofStrip";
import { TestimonialGrid } from "../sections/TestimonialGrid";

export function LandingPage() {
  return (
    <StencilPageShell>
      <Hero />
      <ProofStrip />
      <BenefitsSection />
      <FeatureGrid />
      <TestimonialGrid />
      <CTASection />
    </StencilPageShell>
  );
}
