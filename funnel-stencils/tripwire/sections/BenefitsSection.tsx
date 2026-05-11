import { PatternBenefitsSplit } from "../../_shared/sectionPatterns";

export function BenefitsSection() {
  return (
    <PatternBenefitsSplit
      eyebrow="{{tripwire.benefits.eyebrow}}"
      title="{{tripwire.benefits.heading}}"
      description="{{tripwire.benefits.description}}"
      columns={[
        {
          title: "{{tripwire.benefits.columns[0].title}}",
          items: [
            "{{tripwire.benefits.columns[0].items[0]}}",
            "{{tripwire.benefits.columns[0].items[1]}}",
            "{{tripwire.benefits.columns[0].items[2]}}"
          ]
        },
        {
          title: "{{tripwire.benefits.columns[1].title}}",
          items: [
            "{{tripwire.benefits.columns[1].items[0]}}",
            "{{tripwire.benefits.columns[1].items[1]}}",
            "{{tripwire.benefits.columns[1].items[2]}}"
          ]
        }
      ]}
    />
  );
}
