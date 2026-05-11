import { PatternCountdownOffer } from "../../_shared/sectionPatterns";

export function CountdownOffer() {
  return (
    <PatternCountdownOffer
      eyebrow="{{tripwire.countdown.eyebrow}}"
      title="{{tripwire.countdown.heading}}"
      description="{{tripwire.countdown.description}}"
      timerLabel="{{tripwire.countdown.timerLabel}}"
      urgencyNote="{{tripwire.countdown.urgencyNote}}"
      ctaLabel="{{tripwire.countdown.ctaLabel}}"
    />
  );
}
