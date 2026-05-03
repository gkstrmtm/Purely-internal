import { StencilPageShell } from "../../_shared/primitives";
import { CTASection } from "../sections/CTASection";
import { Hero } from "../sections/Hero";
import { ProofStrip } from "../sections/ProofStrip";
import { SpeakerStrip } from "../sections/SpeakerStrip";
import { TakeawayGrid } from "../sections/TakeawayGrid";
import { WebinarAgenda } from "../sections/WebinarAgenda";

export function LandingPage() {
  return (
    <StencilPageShell>
      <Hero />
      <SpeakerStrip />
      <WebinarAgenda />
      <TakeawayGrid />
      <ProofStrip />
      <CTASection />
    </StencilPageShell>
  );
}
