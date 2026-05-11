import { StencilCard, StencilSectionShell } from "../../_shared/primitives";

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <StencilCard>
      <p className="text-sm font-semibold text-slate-900">{question}</p>
      <p className="mt-3 text-sm leading-7 text-slate-600">{answer}</p>
    </StencilCard>
  );
}

export function FAQSection() {
  return (
    <StencilSectionShell
      eyebrow="{{faq.eyebrow}}"
      title="{{faq.heading}}"
      description="{{faq.description}}"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FAQItem question="{{faq.items[0].question}}" answer="{{faq.items[0].answer}}" />
        <FAQItem question="{{faq.items[1].question}}" answer="{{faq.items[1].answer}}" />
        <FAQItem question="{{faq.items[2].question}}" answer="{{faq.items[2].answer}}" />
        <FAQItem question="{{faq.items[3].question}}" answer="{{faq.items[3].answer}}" />
      </div>
    </StencilSectionShell>
  );
}
