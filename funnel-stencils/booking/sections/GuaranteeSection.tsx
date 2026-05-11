import { PatternGuaranteeSection } from "../../_shared/sectionPatterns";

export function GuaranteeSection() {
  return (
    <PatternGuaranteeSection
      eyebrow="{{booking.guarantee.eyebrow}}"
      title="{{booking.guarantee.heading}}"
      description="{{booking.guarantee.description}}"
      detail="{{booking.guarantee.detail}}"
    />
  );
}
