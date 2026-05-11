import { PatternNextStepPanel } from "../../_shared/sectionPatterns";

export function NextStepPanel() {
  return (
    <PatternNextStepPanel
      eyebrow="{{sales.nextStep.eyebrow}}"
      title="{{sales.nextStep.heading}}"
      description="{{sales.nextStep.description}}"
      primaryLabel="{{sales.nextStep.primaryLabel}}"
      primaryDetail="{{sales.nextStep.primaryDetail}}"
      ctaLabel="{{sales.nextStep.ctaLabel}}"
      ctaHref="{{sales.nextStep.ctaHref}}"
    />
  );
}
