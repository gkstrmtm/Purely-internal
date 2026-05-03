import { PatternCheckoutPanel } from "../../_shared/sectionPatterns";

export function CheckoutPanel() {
  return (
    <PatternCheckoutPanel
      eyebrow="{{sales.checkout.eyebrow}}"
      title="{{sales.checkout.heading}}"
      description="{{sales.checkout.description}}"
      fields={[
        { label: "{{sales.checkout.fields[0].label}}", placeholder: "{{sales.checkout.fields[0].placeholder}}" },
        { label: "{{sales.checkout.fields[1].label}}", placeholder: "{{sales.checkout.fields[1].placeholder}}" },
        { label: "{{sales.checkout.fields[2].label}}", placeholder: "{{sales.checkout.fields[2].placeholder}}" },
        { label: "{{sales.checkout.fields[3].label}}", placeholder: "{{sales.checkout.fields[3].placeholder}}" },
      ]}
      summaryLabel="{{sales.checkout.summaryLabel}}"
      summaryDetail="{{sales.checkout.summaryDetail}}"
      ctaLabel="{{sales.checkout.ctaLabel}}"
    />
  );
}
