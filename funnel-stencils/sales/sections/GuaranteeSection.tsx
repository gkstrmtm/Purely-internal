import { PatternGuaranteeSection } from "../../_shared/sectionPatterns";

export function GuaranteeSection() {
  return (
    <PatternGuaranteeSection
      eyebrow="{{sales.guarantee.eyebrow}}"
      title="{{sales.guarantee.heading}}"
      description="{{sales.guarantee.description}}"
      detail="{{sales.guarantee.detail}}"
    />
  );
}
