import { PatternNextStepPanel } from "../../_shared/sectionPatterns";

export function NextStepPanel() {
  return (
    <PatternNextStepPanel
      eyebrow="{{webinar.nextStep.eyebrow}}"
      title="{{webinar.nextStep.heading}}"
      description="{{webinar.nextStep.description}}"
      primaryLabel="{{webinar.nextStep.primaryLabel}}"
      primaryDetail="{{webinar.nextStep.primaryDetail}}"
      ctaLabel="{{webinar.nextStep.ctaLabel}}"
      ctaHref="{{webinar.nextStep.ctaHref}}"
    />
  );
}
