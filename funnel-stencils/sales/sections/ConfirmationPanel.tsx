import { PatternConfirmationPanel } from "../../_shared/sectionPatterns";

export function ConfirmationPanel() {
  return (
    <PatternConfirmationPanel
      eyebrow="{{sales.confirmation.eyebrow}}"
      title="{{sales.confirmation.heading}}"
      description="{{sales.confirmation.message}}"
      detailHeading="{{sales.confirmation.detailHeading}}"
      detailBody="{{sales.confirmation.detailBody}}"
    />
  );
}
