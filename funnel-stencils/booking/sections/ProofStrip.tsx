import { PatternProofStrip } from "../../_shared/sectionPatterns";

export function ProofStrip() {
  return (
    <PatternProofStrip
      items={[
        { label: "{{booking.proof.items[0].label}}", detail: "{{booking.proof.items[0].detail}}" },
        { label: "{{booking.proof.items[1].label}}", detail: "{{booking.proof.items[1].detail}}" },
        { label: "{{booking.proof.items[2].label}}", detail: "{{booking.proof.items[2].detail}}" },
      ]}
    />
  );
}
