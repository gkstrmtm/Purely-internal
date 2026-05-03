import { PatternCTASection } from "../../_shared/sectionPatterns";

export function CTASection() {
  return (
    <PatternCTASection
      eyebrow="{{sales.cta.eyebrow}}"
      title="{{sales.cta.heading}}"
      description="{{sales.cta.description}}"
      label="{{sales.cta.label}}"
      href="{{sales.cta.href}}"
    />
  );
}
