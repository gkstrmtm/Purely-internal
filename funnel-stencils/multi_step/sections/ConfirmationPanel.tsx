import { PatternConfirmationPanel } from "../../_shared/sectionPatterns";

export function ConfirmationPanel() {
  return (
    <PatternConfirmationPanel
      eyebrow="{{multiStep.confirmation.eyebrow}}"
      title="{{multiStep.confirmation.heading}}"
      description="{{multiStep.confirmation.message}}"
      detailHeading="{{multiStep.confirmation.detailHeading}}"
      detailBody="{{multiStep.confirmation.detailBody}}"
    />
  );
}
