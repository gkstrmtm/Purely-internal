import { PatternBenefitsSplit } from "../../_shared/sectionPatterns";

export function BenefitsSection() {
  return (
    <PatternBenefitsSplit
      eyebrow="{{booking.benefits.eyebrow}}"
      title="{{booking.benefits.heading}}"
      description="{{booking.benefits.description}}"
      columns={[
        {
          title: "{{booking.benefits.columns[0].title}}",
          items: [
            "{{booking.benefits.columns[0].items[0]}}",
            "{{booking.benefits.columns[0].items[1]}}",
            "{{booking.benefits.columns[0].items[2]}}",
          ],
        },
        {
          title: "{{booking.benefits.columns[1].title}}",
          items: [
            "{{booking.benefits.columns[1].items[0]}}",
            "{{booking.benefits.columns[1].items[1]}}",
            "{{booking.benefits.columns[1].items[2]}}",
          ],
        },
      ]}
    />
  );
}
