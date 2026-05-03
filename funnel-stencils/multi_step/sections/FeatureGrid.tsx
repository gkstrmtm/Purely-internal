import { PatternFeatureGrid } from "../../_shared/sectionPatterns";

export function FeatureGrid() {
  return (
    <PatternFeatureGrid
      eyebrow="{{multiStep.features.eyebrow}}"
      title="{{multiStep.features.heading}}"
      description="{{multiStep.features.description}}"
      items={[
        { title: "{{multiStep.features.items[0].title}}", description: "{{multiStep.features.items[0].description}}" },
        { title: "{{multiStep.features.items[1].title}}", description: "{{multiStep.features.items[1].description}}" },
        { title: "{{multiStep.features.items[2].title}}", description: "{{multiStep.features.items[2].description}}" }
      ]}
    />
  );
}
