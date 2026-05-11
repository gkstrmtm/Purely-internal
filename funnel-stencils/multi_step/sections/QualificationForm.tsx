import { PatternFormSection } from "../../_shared/sectionPatterns";

export function QualificationForm() {
  return (
    <PatternFormSection
      eyebrow="{{multiStep.qualification.eyebrow}}"
      title="{{multiStep.qualification.heading}}"
      description="{{multiStep.qualification.description}}"
      fields={[
        { label: "{{multiStep.qualification.fields[0].label}}", placeholder: "{{multiStep.qualification.fields[0].placeholder}}" },
        { label: "{{multiStep.qualification.fields[1].label}}", placeholder: "{{multiStep.qualification.fields[1].placeholder}}" },
        { label: "{{multiStep.qualification.fields[2].label}}", placeholder: "{{multiStep.qualification.fields[2].placeholder}}" },
        { label: "{{multiStep.qualification.fields[3].label}}", placeholder: "{{multiStep.qualification.fields[3].placeholder}}" }
      ]}
      supportingText="{{multiStep.qualification.supportingText}}"
      ctaLabel="{{multiStep.qualification.ctaLabel}}"
    />
  );
}
