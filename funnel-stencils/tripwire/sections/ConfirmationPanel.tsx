import { PatternConfirmationPanel } from "../../_shared/sectionPatterns";

export function ConfirmationPanel() {
  return (
    <PatternConfirmationPanel
      eyebrow="{{tripwire.confirmation.eyebrow}}"
      title="{{tripwire.confirmation.heading}}"
      description="{{tripwire.confirmation.message}}"
      detailHeading="{{tripwire.confirmation.detailHeading}}"
      detailBody="{{tripwire.confirmation.detailBody}}"
    />
  );
}
