import { PatternFeatureGrid } from "../../_shared/sectionPatterns";

export function FeatureGrid() {
  return (
    <PatternFeatureGrid
      eyebrow="{{sales.features.eyebrow}}"
      title="{{sales.features.heading}}"
      description="{{sales.features.description}}"
      items={[
        { title: "{{sales.features.items[0].title}}", description: "{{sales.features.items[0].description}}" },
        { title: "{{sales.features.items[1].title}}", description: "{{sales.features.items[1].description}}" },
        { title: "{{sales.features.items[2].title}}", description: "{{sales.features.items[2].description}}" },
      ]}
    />
  );
}
