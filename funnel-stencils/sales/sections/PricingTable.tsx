import { PatternPricingTable } from "../../_shared/sectionPatterns";

export function PricingTable() {
  return (
    <PatternPricingTable
      eyebrow="{{sales.pricing.eyebrow}}"
      title="{{sales.pricing.heading}}"
      description="{{sales.pricing.description}}"
      plans={[
        {
          name: "{{sales.pricing.plans[0].name}}",
          price: "{{sales.pricing.plans[0].price}}",
          description: "{{sales.pricing.plans[0].description}}",
          ctaLabel: "{{sales.pricing.plans[0].ctaLabel}}",
          features: [
            "{{sales.pricing.plans[0].features[0]}}",
            "{{sales.pricing.plans[0].features[1]}}",
            "{{sales.pricing.plans[0].features[2]}}",
          ],
        },
        {
          name: "{{sales.pricing.plans[1].name}}",
          price: "{{sales.pricing.plans[1].price}}",
          description: "{{sales.pricing.plans[1].description}}",
          ctaLabel: "{{sales.pricing.plans[1].ctaLabel}}",
          features: [
            "{{sales.pricing.plans[1].features[0]}}",
            "{{sales.pricing.plans[1].features[1]}}",
            "{{sales.pricing.plans[1].features[2]}}",
          ],
        },
        {
          name: "{{sales.pricing.plans[2].name}}",
          price: "{{sales.pricing.plans[2].price}}",
          description: "{{sales.pricing.plans[2].description}}",
          ctaLabel: "{{sales.pricing.plans[2].ctaLabel}}",
          features: [
            "{{sales.pricing.plans[2].features[0]}}",
            "{{sales.pricing.plans[2].features[1]}}",
            "{{sales.pricing.plans[2].features[2]}}",
          ],
        },
      ]}
    />
  );
}
