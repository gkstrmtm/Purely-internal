import { PatternCTASection } from "../../_shared/sectionPatterns";

export function CTASection() {
  return (
    <PatternCTASection
      eyebrow="{{booking.cta.eyebrow}}"
      title="{{booking.cta.heading}}"
      description="{{booking.cta.description}}"
      label="{{booking.cta.label}}"
      href="{{booking.cta.href}}"
    />
  );
}
