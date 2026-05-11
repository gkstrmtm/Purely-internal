import { PatternProofStrip } from "../../_shared/sectionPatterns";

export function ProofStrip() {
  return (
    <PatternProofStrip
      items={[
        { label: "{{webinar.proof.items[0].label}}", detail: "{{webinar.proof.items[0].detail}}" },
        { label: "{{webinar.proof.items[1].label}}", detail: "{{webinar.proof.items[1].detail}}" },
        { label: "{{webinar.proof.items[2].label}}", detail: "{{webinar.proof.items[2].detail}}" }
      ]}
    />
  );
}
