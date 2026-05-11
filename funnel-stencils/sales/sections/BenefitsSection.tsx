import { PatternBenefitsSplit } from "../../_shared/sectionPatterns";

export function BenefitsSection() {
  return (
    <PatternBenefitsSplit
      eyebrow="{{sales.benefits.eyebrow}}"
      title="{{sales.benefits.heading}}"
      description="{{sales.benefits.description}}"
      columns={[
        {
          title: "{{sales.benefits.columns[0].title}}",
          items: [
            "{{sales.benefits.columns[0].items[0]}}",
            "{{sales.benefits.columns[0].items[1]}}",
            "{{sales.benefits.columns[0].items[2]}}",
          ],
        },
        {
          title: "{{sales.benefits.columns[1].title}}",
          items: [
            "{{sales.benefits.columns[1].items[0]}}",
            "{{sales.benefits.columns[1].items[1]}}",
            "{{sales.benefits.columns[1].items[2]}}",
          ],
        },
      ]}
    />
  );
}
