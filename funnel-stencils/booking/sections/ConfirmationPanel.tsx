import { PatternConfirmationPanel } from "../../_shared/sectionPatterns";

export function ConfirmationPanel() {
  return (
    <PatternConfirmationPanel
      eyebrow="{{booking.confirmation.eyebrow}}"
      title="{{booking.confirmation.heading}}"
      description="{{booking.confirmation.message}}"
      detailHeading="{{booking.confirmation.detailHeading}}"
      detailBody="{{booking.confirmation.detailBody}}"
    />
  );
}
