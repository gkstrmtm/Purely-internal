import { PatternCheckoutPanel } from "../../_shared/sectionPatterns";

export function CheckoutPanel() {
  return (
    <PatternCheckoutPanel
      eyebrow="{{tripwire.checkout.eyebrow}}"
      title="{{tripwire.checkout.heading}}"
      description="{{tripwire.checkout.description}}"
      fields={[
        { label: "{{tripwire.checkout.fields[0].label}}", placeholder: "{{tripwire.checkout.fields[0].placeholder}}" },
        { label: "{{tripwire.checkout.fields[1].label}}", placeholder: "{{tripwire.checkout.fields[1].placeholder}}" },
        { label: "{{tripwire.checkout.fields[2].label}}", placeholder: "{{tripwire.checkout.fields[2].placeholder}}" },
        { label: "{{tripwire.checkout.fields[3].label}}", placeholder: "{{tripwire.checkout.fields[3].placeholder}}" }
      ]}
      summaryLabel="{{tripwire.checkout.summaryLabel}}"
      summaryDetail="{{tripwire.checkout.summaryDetail}}"
      ctaLabel="{{tripwire.checkout.ctaLabel}}"
    />
  );
}
