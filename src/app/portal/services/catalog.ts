export type PortalService = {
  slug: string;
  title: string;
  description: string;
  highlights?: string[];
  variants?: ("portal" | "credit")[];
  entitlementKey?:
    | "blog"
    | "booking"
    | "automations"
    | "reviews"
    | "newsletter"
    | "nurture"
    | "aiReceptionist"
    | "leadScraping"
    | "crm"
    | "leadOutbound";
  included?: boolean;
  accent: "blue" | "coral" | "ink";
  hidden?: boolean;
};

export const PORTAL_SERVICES: PortalService[] = [
  {
    slug: "funnel-builder",
    title: "Funnel Builder",
    description: "Launch high-converting funnels and capture more leads.",
    highlights: [
      "Build unlimited funnels and landing pages",
      "Create forms that capture qualified leads",
      "Run everything on your own branded domain",
    ],
    included: true,
    accent: "blue",
    variants: ["portal", "credit"],
  },
  {
    slug: "dispute-letters",
    title: "Dispute Letters",
    description: "Generate and send credit dispute letters.",
    highlights: [
      "Pick a contact",
      "Generate a letter with AI",
      "Edit and send directly to the contact",
    ],
    included: true,
    accent: "coral",
    variants: ["credit"],
  },
  {
    slug: "credit-reports",
    title: "Credit Reports",
    description: "Import and audit credit reports, and track disputed items.",
    highlights: [
      "Import a report (JSON for now)",
      "Tag items pending / negative / positive",
      "Track dispute status over time",
    ],
    included: true,
    accent: "ink",
    variants: ["credit"],
  },
  {
    slug: "inbox",
    title: "Inbox / Outbox",
    description: "Keep every conversation in one place so you reply faster.",
    highlights: [
      "Keep SMS + email history together",
      "Reply with full context (no digging)",
      "Move faster with a clean team inbox",
    ],
    included: true,
    accent: "blue",
  },
  {
    slug: "media-library",
    title: "Media Library",
    description: "Save time reusing photos, videos, and files across campaigns.",
    highlights: [
      "Organize content once, reuse it everywhere",
      "Share links instantly with your team",
      "Attach media to SMS + email in seconds",
    ],
    included: true,
    accent: "coral",
  },
  {
    slug: "tasks",
    title: "Tasks",
    description: "Keep your team aligned with clear next steps and ownership.",
    highlights: [
      "Assign work and track follow-through",
      "See what’s open vs done at a glance",
      "Turn repeatable work into automations",
    ],
    included: true,
    accent: "ink",
  },
  {
    slug: "ai-receptionist",
    title: "AI Receptionist",
    description: "Stop missing calls and capture more leads automatically.",
    highlights: [
      "Never miss a call (even after-hours)",
      "Capture lead details automatically",
      "Route requests instantly to the right person",
    ],
    entitlementKey: "aiReceptionist",
    accent: "blue",
  },
  {
    slug: "newsletter",
    title: "Newsletter",
    description: "Stay top-of-mind with consistent updates that drive replies.",
    highlights: [
      "Send to the right audience with segmentation",
      "Templates + personalization that feels human",
      "Track opens and performance",
    ],
    entitlementKey: "newsletter",
    accent: "coral",
  },
  {
    slug: "booking",
    title: "Booking Automation",
    description: "Turn more leads into booked appointments without the back-and-forth.",
    highlights: [
      "Book faster with instant confirmations",
      "Route bookings using simple rules",
      "Reduce no-shows with reminders + follow-ups",
    ],
    entitlementKey: "booking",
    accent: "ink",
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
    entitlementKey: "booking",
    accent: "ink",
    hidden: true,
  },
  {
    slug: "ai-outbound-calls",
    title: "AI outbound",
    description: "Automate outbound call follow-up without adding headcount.",
    highlights: [
      "Reach leads fast while they’re still hot",
      "Consistent messaging with a tuned script",
      "Log outcomes and trigger next steps",
    ],
    entitlementKey: "leadOutbound",
    accent: "blue",
  },
  {
    slug: "lead-scraping",
    title: "Lead Scraping",
    description: "Access a large database of targeted leads on demand.",
    highlights: [
      "Pull niche + location leads in minutes",
      "Never hit the same lead twice",
      "Automatically pull and route leads on a schedule",
    ],
    entitlementKey: "leadScraping",
    accent: "coral",
  },
  {
    slug: "automations",
    title: "Automation Builder",
    description: "Fully customize your follow-up and ops workflows in one place.",
    highlights: [
      "Create advanced sequences with simple building blocks",
      "Mix triggers, steps, and conditions for thousands of variations",
      "Save, reuse, and improve workflows over time",
    ],
    entitlementKey: "automations",
    accent: "ink",
  },
  {
    slug: "blogs",
    title: "Automated Blogs",
    description: "Stay visible with consistent SEO content without writing every week.",
    highlights: [
      "Publish consistently to build authority",
      "Drafts created + scheduled automatically",
      "Quick review and edits before publishing",
    ],
    entitlementKey: "blog",
    accent: "blue",
  },
  {
    slug: "missed-call-textback",
    title: "Missed call, text back",
    description: "Turn missed calls into conversations.",
    highlights: [
      "Auto text within seconds",
      "Qualify intent and capture details",
      "Book or hand off to your team",
    ],
    entitlementKey: "aiReceptionist",
    accent: "coral",
    hidden: true,
  },
  {
    slug: "reviews",
    title: "Reviews",
    description: "Get more reviews consistently without chasing customers.",
    highlights: [
      "Automatically request reviews at the right time",
      "Increase response rates with SMS-first outreach",
      "Track sends, replies, and outcomes",
    ],
    entitlementKey: "reviews",
    accent: "coral",
  },
  {
    slug: "nurture-campaigns",
    title: "Nurture Campaigns",
    description: "Convert more leads with long-term follow-up that runs itself.",
    highlights: [
      "Multi-step sequences across channels",
      "Smart delays and conditions",
      "Simple performance reporting",
    ],
    entitlementKey: "nurture",
    accent: "ink",
  },
  {
    slug: "reporting",
    title: "Reporting",
    description: "See what’s working, what ran, and where you’re saving time.",
    highlights: [
      "Weekly hours-saved snapshot",
      "Service activity summaries",
      "Export-ready reporting",
    ],
    included: true,
    accent: "blue",
  },
];
