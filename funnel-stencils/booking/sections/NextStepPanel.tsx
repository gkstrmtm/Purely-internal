import { PatternNextStepPanel } from "../../_shared/sectionPatterns";

export function NextStepPanel() {
  return (
    <PatternNextStepPanel
      eyebrow="{{booking.nextStep.eyebrow}}"
      title="{{booking.nextStep.heading}}"
      description="{{booking.nextStep.description}}"
      primaryLabel="{{booking.nextStep.primaryLabel}}"
      primaryDetail="{{booking.nextStep.primaryDetail}}"
      ctaLabel="{{booking.nextStep.ctaLabel}}"
      ctaHref="{{booking.nextStep.ctaHref}}"
    />
  );
}
