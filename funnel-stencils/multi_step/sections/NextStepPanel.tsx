import { PatternNextStepPanel } from "../../_shared/sectionPatterns";

export function NextStepPanel() {
  return (
    <PatternNextStepPanel
      eyebrow="{{multiStep.nextStep.eyebrow}}"
      title="{{multiStep.nextStep.heading}}"
      description="{{multiStep.nextStep.description}}"
      primaryLabel="{{multiStep.nextStep.primaryLabel}}"
      primaryDetail="{{multiStep.nextStep.primaryDetail}}"
      ctaLabel="{{multiStep.nextStep.ctaLabel}}"
      ctaHref="{{multiStep.nextStep.ctaHref}}"
    />
  );
}
