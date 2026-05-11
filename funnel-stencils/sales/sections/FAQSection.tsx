import { PatternFAQSection } from "../../_shared/sectionPatterns";

export function FAQSection() {
  return (
    <PatternFAQSection
      eyebrow="{{sales.faq.eyebrow}}"
      title="{{sales.faq.heading}}"
      description="{{sales.faq.description}}"
      items={[
        { question: "{{sales.faq.items[0].question}}", answer: "{{sales.faq.items[0].answer}}" },
        { question: "{{sales.faq.items[1].question}}", answer: "{{sales.faq.items[1].answer}}" },
        { question: "{{sales.faq.items[2].question}}", answer: "{{sales.faq.items[2].answer}}" },
        { question: "{{sales.faq.items[3].question}}", answer: "{{sales.faq.items[3].answer}}" },
      ]}
    />
  );
}
