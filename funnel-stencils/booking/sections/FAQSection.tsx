import { PatternFAQSection } from "../../_shared/sectionPatterns";

export function FAQSection() {
  return (
    <PatternFAQSection
      eyebrow="{{booking.faq.eyebrow}}"
      title="{{booking.faq.heading}}"
      description="{{booking.faq.description}}"
      items={[
        { question: "{{booking.faq.items[0].question}}", answer: "{{booking.faq.items[0].answer}}" },
        { question: "{{booking.faq.items[1].question}}", answer: "{{booking.faq.items[1].answer}}" },
        { question: "{{booking.faq.items[2].question}}", answer: "{{booking.faq.items[2].answer}}" },
        { question: "{{booking.faq.items[3].question}}", answer: "{{booking.faq.items[3].answer}}" },
      ]}
    />
  );
}
