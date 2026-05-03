import { PatternConfirmationPanel } from "../../_shared/sectionPatterns";

export function ConfirmationPanel() {
  return (
    <PatternConfirmationPanel
      eyebrow="{{webinar.confirmation.eyebrow}}"
      title="{{webinar.confirmation.heading}}"
      description="{{webinar.confirmation.message}}"
      detailHeading="{{webinar.confirmation.detailHeading}}"
      detailBody="{{webinar.confirmation.detailBody}}"
    />
  );
}
