import { PatternWebinarAgenda } from "../../_shared/sectionPatterns";

export function WebinarAgenda() {
  return (
    <PatternWebinarAgenda
      eyebrow="{{webinar.agenda.eyebrow}}"
      title="{{webinar.agenda.heading}}"
      description="{{webinar.agenda.description}}"
      items={[
        { label: "{{webinar.agenda.items[0].label}}", detail: "{{webinar.agenda.items[0].detail}}" },
        { label: "{{webinar.agenda.items[1].label}}", detail: "{{webinar.agenda.items[1].detail}}" },
        { label: "{{webinar.agenda.items[2].label}}", detail: "{{webinar.agenda.items[2].detail}}" }
      ]}
    />
  );
}
