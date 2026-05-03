import { PatternFeatureGrid } from "../../_shared/sectionPatterns";

export function TakeawayGrid() {
  return (
    <PatternFeatureGrid
      eyebrow="{{webinar.takeaways.eyebrow}}"
      title="{{webinar.takeaways.heading}}"
      description="{{webinar.takeaways.description}}"
      items={[
        { title: "{{webinar.takeaways.items[0].title}}", description: "{{webinar.takeaways.items[0].description}}" },
        { title: "{{webinar.takeaways.items[1].title}}", description: "{{webinar.takeaways.items[1].description}}" },
        { title: "{{webinar.takeaways.items[2].title}}", description: "{{webinar.takeaways.items[2].description}}" }
      ]}
    />
  );
}
