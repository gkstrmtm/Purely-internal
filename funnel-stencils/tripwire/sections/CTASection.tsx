import { PatternCTASection } from "../../_shared/sectionPatterns";

export function CTASection() {
  return (
    <PatternCTASection
      eyebrow="{{tripwire.cta.eyebrow}}"
      title="{{tripwire.cta.heading}}"
      description="{{tripwire.cta.description}}"
      label="{{tripwire.cta.label}}"
      href="{{tripwire.cta.href}}"
    />
  );
}
