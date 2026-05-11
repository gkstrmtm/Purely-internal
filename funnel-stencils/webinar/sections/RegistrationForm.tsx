import { PatternFormSection } from "../../_shared/sectionPatterns";

export function RegistrationForm() {
  return (
    <PatternFormSection
      eyebrow="{{webinar.registration.eyebrow}}"
      title="{{webinar.registration.heading}}"
      description="{{webinar.registration.description}}"
      fields={[
        { label: "{{webinar.registration.fields[0].label}}", placeholder: "{{webinar.registration.fields[0].placeholder}}" },
        { label: "{{webinar.registration.fields[1].label}}", placeholder: "{{webinar.registration.fields[1].placeholder}}" },
        { label: "{{webinar.registration.fields[2].label}}", placeholder: "{{webinar.registration.fields[2].placeholder}}" },
        { label: "{{webinar.registration.fields[3].label}}", placeholder: "{{webinar.registration.fields[3].placeholder}}" }
      ]}
      supportingText="{{webinar.registration.supportingText}}"
      ctaLabel="{{webinar.registration.ctaLabel}}"
    />
  );
}
