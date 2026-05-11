import { PatternProofStrip } from "../../_shared/sectionPatterns";

export function ProofStrip() {
  return (
    <PatternProofStrip
      items={[
        { label: "{{sales.proof.items[0].label}}", detail: "{{sales.proof.items[0].detail}}" },
        { label: "{{sales.proof.items[1].label}}", detail: "{{sales.proof.items[1].detail}}" },
        { label: "{{sales.proof.items[2].label}}", detail: "{{sales.proof.items[2].detail}}" },
      ]}
    />
  );
}
