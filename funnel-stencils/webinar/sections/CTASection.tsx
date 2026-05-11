import { PatternCTASection } from "../../_shared/sectionPatterns";

export function CTASection() {
  return (
    <PatternCTASection
      eyebrow="{{webinar.cta.eyebrow}}"
      title="{{webinar.cta.heading}}"
      description="{{webinar.cta.description}}"
      label="{{webinar.cta.label}}"
      href="{{webinar.cta.href}}"
    />
  );
}
