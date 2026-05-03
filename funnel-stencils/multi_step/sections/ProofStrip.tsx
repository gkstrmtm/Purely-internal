import { PatternProofStrip } from "../../_shared/sectionPatterns";

export function ProofStrip() {
  return (
    <PatternProofStrip
      items={[
        { label: "{{multiStep.proof.items[0].label}}", detail: "{{multiStep.proof.items[0].detail}}" },
        { label: "{{multiStep.proof.items[1].label}}", detail: "{{multiStep.proof.items[1].detail}}" },
        { label: "{{multiStep.proof.items[2].label}}", detail: "{{multiStep.proof.items[2].detail}}" }
      ]}
    />
  );
}
