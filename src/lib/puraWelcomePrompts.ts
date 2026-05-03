export type PromptChipDefinition = {
  id: string;
  prompt: string;
  slugs?: string[];
  keywords?: string[];
};

export const PURA_WELCOME_PROMPT_LIBRARY: PromptChipDefinition[] = [
  {
    id: "follow-up-priorities",
    prompt: "Review my follow-up workflows and tell me what should be fixed first.",
    slugs: ["follow-up", "automations"],
    keywords: ["follow up", "workflow", "automation", "sequence"],
  },
  {
    id: "booking-audit",
    prompt: "Audit my booking flow and tell me what is most likely hurting conversions.",
    slugs: ["booking", "funnel-builder"],
    keywords: ["booking", "calendar", "schedule", "call"],
  },
  {
    id: "inbox-triage",
    prompt: "Scan my inbox context and tell me what needs a response or decision today.",
    slugs: ["inbox", "people"],
    keywords: ["inbox", "thread", "reply", "email", "sms"],
  },
  {
    id: "contact-cleanup",
    prompt: "Look at my contacts and point out duplicates, dead leads, or missing next steps.",
    slugs: ["people"],
    keywords: ["contacts", "lead", "client", "duplicate"],
  },
  {
    id: "funnel-improve",
    prompt: "Review my funnel and tell me the highest-impact conversion changes.",
    slugs: ["funnel-builder"],
    keywords: ["funnel", "landing page", "cta", "conversion"],
  },
  {
    id: "newsletter-review",
    prompt: "Review my newsletter workflow and show me what should be tightened before send.",
    slugs: ["newsletter"],
    keywords: ["newsletter", "campaign", "send", "audience"],
  },
  {
    id: "reviews-check",
    prompt: "Check my reviews setup and tell me what is missing or underused.",
    slugs: ["reviews"],
    keywords: ["reviews", "testimonials", "proof", "reputation"],
  },
  {
    id: "task-plan",
    prompt: "Turn this into a task plan with the most important next steps first.",
    slugs: ["tasks", "automations"],
    keywords: ["task", "plan", "todo", "checklist"],
  },
  {
    id: "blogs-ops",
    prompt: "Review my blog workflow and tell me what content or ops issues need attention.",
    slugs: ["blogs"],
    keywords: ["blog", "post", "content", "seo"],
  },
];