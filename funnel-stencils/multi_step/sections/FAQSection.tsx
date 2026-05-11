import { PatternFAQSection } from "../../_shared/sectionPatterns";

export function FAQSection() {
  return (
    <PatternFAQSection
      eyebrow="{{multiStep.faq.eyebrow}}"
      title="{{multiStep.faq.heading}}"
      description="{{multiStep.faq.description}}"
      items={[
        { question: "{{multiStep.faq.items[0].question}}", answer: "{{multiStep.faq.items[0].answer}}" },
        { question: "{{multiStep.faq.items[1].question}}", answer: "{{multiStep.faq.items[1].answer}}" },
        { question: "{{multiStep.faq.items[2].question}}", answer: "{{multiStep.faq.items[2].answer}}" },
        { question: "{{multiStep.faq.items[3].question}}", answer: "{{multiStep.faq.items[3].answer}}" }
      ]}
    />
  );
}
