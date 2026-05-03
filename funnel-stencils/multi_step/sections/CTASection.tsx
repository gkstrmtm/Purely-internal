import { PatternCTASection } from "../../_shared/sectionPatterns";

export function CTASection() {
  return (
    <PatternCTASection
      eyebrow="{{multiStep.cta.eyebrow}}"
      title="{{multiStep.cta.heading}}"
      description="{{multiStep.cta.description}}"
      label="{{multiStep.cta.label}}"
      href="{{multiStep.cta.href}}"
    />
  );
}
