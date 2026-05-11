import { PatternSpeakerStrip } from "../../_shared/sectionPatterns";

export function SpeakerStrip() {
  return (
    <PatternSpeakerStrip
      eyebrow="{{webinar.speakers.eyebrow}}"
      title="{{webinar.speakers.heading}}"
      description="{{webinar.speakers.description}}"
      speakers={[
        {
          name: "{{webinar.speakers.items[0].name}}",
          role: "{{webinar.speakers.items[0].role}}",
          detail: "{{webinar.speakers.items[0].detail}}",
        },
        {
          name: "{{webinar.speakers.items[1].name}}",
          role: "{{webinar.speakers.items[1].role}}",
          detail: "{{webinar.speakers.items[1].detail}}",
        },
        {
          name: "{{webinar.speakers.items[2].name}}",
          role: "{{webinar.speakers.items[2].role}}",
          detail: "{{webinar.speakers.items[2].detail}}",
        }
      ]}
    />
  );
}
