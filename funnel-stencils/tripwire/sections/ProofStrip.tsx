import { PatternProofStrip } from "../../_shared/sectionPatterns";

export function ProofStrip() {
  return (
    <PatternProofStrip
      items={[
        { label: "{{tripwire.proof.items[0].label}}", detail: "{{tripwire.proof.items[0].detail}}" },
        { label: "{{tripwire.proof.items[1].label}}", detail: "{{tripwire.proof.items[1].detail}}" },
        { label: "{{tripwire.proof.items[2].label}}", detail: "{{tripwire.proof.items[2].detail}}" }
      ]}
    />
  );
}
