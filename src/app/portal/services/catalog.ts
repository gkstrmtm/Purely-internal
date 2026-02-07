export type PortalService = {
  slug: string;
  title: string;
  description: string;
  highlights?: string[];
  entitlementKey?: "blog" | "booking" | "crm";
  accent: "blue" | "coral" | "ink";
};

export const PORTAL_SERVICES: PortalService[] = [
  {
    slug: "blogs",
    title: "Automated Blogs",
    description: "Consistent posting without the weekly scramble.",
    highlights: [
      "Weekly topic + outline suggestions",
      "Draft creation and scheduling",
      "Light edits and publishing workflow",
    ],
    entitlementKey: "blog",
    accent: "blue",
  },
  {
    slug: "booking",
    title: "Booking Automation",
    description: "Reduce back-and-forth and capture more appointments.",
    highlights: [
      "Instant confirmation and reminders",
      "Calendar + form routing",
      "No-show reduction workflows",
    ],
    entitlementKey: "booking",
    accent: "coral",
  },
  {
    slug: "follow-up",
    title: "Follow-up Automation",
    description: "Keep leads warm with simple, reliable touch points.",
    highlights: [
      "SMS and email follow-up sequences",
      "Pipeline stage-based triggers",
      "Human handoff when needed",
    ],
    entitlementKey: "crm",
    accent: "ink",
  },
  {
    slug: "ai-receptionist",
    title: "AI Receptionist",
    description: "Frontline answers and routing for common requests.",
    highlights: [
      "Answer common questions 24/7",
      "Route messages to the right person",
      "Collect details before handoff",
    ],
    accent: "blue",
  },
  {
    slug: "missed-call-textback",
    title: "Missed-Call Text Back",
    description: "Turn missed calls into conversations.",
    highlights: [
      "Auto text within seconds",
      "Qualify intent and capture details",
      "Book or hand off to your team",
    ],
    accent: "coral",
  },
  {
    slug: "reviews",
    title: "Review Requests",
    description: "Ask at the right time and stay consistent.",
    highlights: [
      "Send after completed jobs",
      "Filter by happy customers",
      "Track requests and responses",
    ],
    accent: "coral",
  },
  {
    slug: "lead-scraping",
    title: "Lead Scraping",
    description: "Pull fresh leads with exclusions and usage-based credits.",
    highlights: [
      "Search by niche and location",
      "Exclude lists + de-dupe against past pulls",
      "Schedule recurring pulls",
    ],
    entitlementKey: "crm",
    accent: "ink",
  },
  {
    slug: "reporting",
    title: "Reporting",
    description: "Visibility into what’s live and what’s saving time.",
    highlights: [
      "Weekly hours-saved snapshot",
      "Service activity summaries",
      "Export-ready reporting",
    ],
    accent: "blue",
  },
];
