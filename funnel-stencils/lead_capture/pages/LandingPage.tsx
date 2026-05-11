import { StencilPageShell } from "../../_shared/primitives";
import { BenefitsSection } from "../sections/BenefitsSection";
import { CTASection } from "../sections/CTASection";
import { FAQSection } from "../sections/FAQSection";
import { Hero } from "../sections/Hero";
import { LeadForm } from "../sections/LeadForm";
import { ProofStrip } from "../sections/ProofStrip";
import { TestimonialGrid } from "../sections/TestimonialGrid";

export function LandingPage() {
  return (
    <StencilPageShell>
      <Hero />
      <ProofStrip />
      <BenefitsSection />
      <LeadForm />
      <TestimonialGrid />
      <FAQSection />
      <CTASection />
    </StencilPageShell>
  );
}
