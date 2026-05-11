import { StencilPageShell } from "../../_shared/primitives";
import { CTASection } from "../sections/CTASection";
import { FeatureGrid } from "../sections/FeatureGrid";
import { Hero } from "../sections/Hero";
import { ProofStrip } from "../sections/ProofStrip";

export function EntryPage() {
  return (
    <StencilPageShell>
      <Hero />
      <FeatureGrid />
      <ProofStrip />
      <CTASection />
    </StencilPageShell>
  );
}
