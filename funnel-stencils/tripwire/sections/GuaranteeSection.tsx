import { PatternGuaranteeSection } from "../../_shared/sectionPatterns";

export function GuaranteeSection() {
  return (
    <PatternGuaranteeSection
      eyebrow="{{tripwire.guarantee.eyebrow}}"
      title="{{tripwire.guarantee.heading}}"
      description="{{tripwire.guarantee.description}}"
      detail="{{tripwire.guarantee.detail}}"
    />
  );
}
