export type PromptChipDefinition = {
  id: string;
  prompt: string;
  slugs?: string[];
  keywords?: string[];
};

export const PURA_WELCOME_PROMPT_LIBRARY: PromptChipDefinition[] = [
  { id: "leads-priority", prompt: "Summarize the highest-priority leads I should follow up with today.", slugs: ["lead-scraping", "crm", "inbox", "ai-receptionist"], keywords: ["lead", "follow up", "priority"] },
  { id: "marketing-week", prompt: "Plan three marketing tasks I can finish this week.", slugs: ["blogs", "newsletter", "funnel-builder", "media-library"], keywords: ["marketing", "campaign", "content"] },
  { id: "automation-next", prompt: "Review what Pura can help automate next for this business.", slugs: ["automations", "tasks", "booking", "nurture-campaigns"], keywords: ["automate", "workflow", "system"] },
  { id: "missed-calls", prompt: "Help me tighten our missed-call follow-up flow.", slugs: ["ai-receptionist", "missed-call-textback", "booking"], keywords: ["call", "missed", "text back"] },
  { id: "newsletter-ideas", prompt: "Give me three newsletter ideas I can send this month.", slugs: ["newsletter", "blogs"], keywords: ["newsletter", "email", "audience"] },
  { id: "booking-gaps", prompt: "Find weak spots in our booking flow and suggest fixes.", slugs: ["booking", "funnel-builder", "ai-receptionist"], keywords: ["book", "booking", "appointment"] },
  { id: "task-cleanup", prompt: "Turn my open work into a clean action plan for today.", slugs: ["tasks", "automations"], keywords: ["task", "todo", "plan"] },
  { id: "blog-seo", prompt: "Map out blog topics that could bring in better search traffic.", slugs: ["blogs", "funnel-builder"], keywords: ["blog", "seo", "search"] },
  { id: "review-request", prompt: "Draft a smarter review request flow for recent customers.", slugs: ["reviews", "automations", "inbox"], keywords: ["review", "reputation", "customer"] },
  { id: "nurture-refresh", prompt: "Refresh our nurture campaign so it feels more personal.", slugs: ["nurture-campaigns", "newsletter", "inbox"], keywords: ["nurture", "sequence", "personal"] },
  { id: "reporting-summary", prompt: "Show me what the reporting data is saying we should fix first.", slugs: ["reporting", "automations", "booking"], keywords: ["report", "reporting", "numbers"] },
  { id: "inbox-backlog", prompt: "Help me clear the inbox backlog with the fastest wins first.", slugs: ["inbox", "tasks", "ai-receptionist"], keywords: ["inbox", "reply", "backlog"] },
  { id: "outbound-script", prompt: "Write a tighter outbound script for leads that went cold.", slugs: ["ai-outbound-calls", "lead-scraping", "inbox"], keywords: ["outbound", "cold", "script"] },
  { id: "lead-list", prompt: "Suggest the best kind of leads to scrape next and why.", slugs: ["lead-scraping", "ai-outbound-calls", "reporting"], keywords: ["lead", "scrape", "prospect"] },
  { id: "media-reuse", prompt: "Find ways we can reuse our existing media across more campaigns.", slugs: ["media-library", "newsletter", "blogs", "funnel-builder"], keywords: ["media", "asset", "creative"] },
  { id: "funnel-conversion", prompt: "Audit our funnel and give me three conversion improvements.", slugs: ["funnel-builder", "booking", "reporting"], keywords: ["funnel", "conversion", "landing page"] },
  { id: "appointment-reminders", prompt: "Draft a reminder sequence to reduce appointment no-shows.", slugs: ["booking", "follow-up", "automations"], keywords: ["reminder", "no-show", "appointment"] },
  { id: "team-focus", prompt: "Tell me where my team should focus first this week.", slugs: ["tasks", "reporting", "automations"], keywords: ["team", "focus", "week"] },
  { id: "followup-rewrite", prompt: "Rewrite our follow-up messaging so it gets more replies.", slugs: ["follow-up", "inbox", "newsletter"], keywords: ["follow-up", "reply", "message"] },
  { id: "automation-builder", prompt: "Design an automation that saves the team the most manual work.", slugs: ["automations", "tasks", "inbox"], keywords: ["automation", "manual", "save time"] },
  { id: "receptionist-script", prompt: "Improve our AI receptionist script for higher-quality leads.", slugs: ["ai-receptionist", "booking"], keywords: ["receptionist", "caller", "lead quality"] },
  { id: "sales-story", prompt: "Explain our sales performance in plain English and what to do next.", slugs: ["reporting", "inbox", "booking"], keywords: ["sales", "pipeline", "performance"] },
  { id: "content-calendar", prompt: "Build a simple content calendar around our best offers.", slugs: ["blogs", "newsletter", "media-library"], keywords: ["content", "calendar", "offer"] },
  { id: "new-offer", prompt: "Help me turn one service into a stronger offer people actually respond to.", slugs: ["funnel-builder", "booking", "reporting"], keywords: ["offer", "service", "respond"] },
  { id: "reactivation", prompt: "Create a reactivation plan for leads we have not touched in a while.", slugs: ["nurture-campaigns", "inbox", "ai-outbound-calls"], keywords: ["reactivation", "old leads", "win back"] },
  { id: "reviews-replies", prompt: "Help me turn new reviews into follow-up opportunities.", slugs: ["reviews", "inbox", "tasks"], keywords: ["review", "reply", "opportunity"] },
  { id: "default-systems", prompt: "What are the next three systems I should tighten up in the business?", keywords: ["systems", "business", "next"] },
  { id: "default-team", prompt: "What should I delegate, automate, and personally handle this week?", keywords: ["delegate", "automate", "week"] },
];
