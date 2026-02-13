export type PortalService = {
  slug: string;
  title: string;
  description: string;
  highlights?: string[];
  entitlementKey?: "blog" | "booking" | "crm" | "leadOutbound";
  included?: boolean;
  accent: "blue" | "coral" | "ink";
  hidden?: boolean;
};

export const PORTAL_SERVICES: PortalService[] = [
  {
    slug: "inbox",
    title: "Inbox / Outbox",
    description: "Email + SMS threads in one place.",
    highlights: [
      "Email threads (Gmail-style)",
       "SMS threads",
      "Send messages directly from the portal",
    ],
    included: true,
    accent: "blue",
  },
  {
    slug: "media-library",
    title: "Media Library",
    description: "Store and reuse photos, videos, and files.",
    highlights: [
      "Folders + simple sharing links",
      "Preview, download, and copy link",
      "Attach media into SMS and email",
    ],
    included: true,
    accent: "blue",
  },
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
    slug: "automations",
    title: "Automation Builder",
    description: "Build your own automations with triggers and steps.",
    highlights: [
      "Drag-and-drop triggers + actions",
      "Connect steps into a flow",
      "Save multiple automations",
    ],
    accent: "ink",
  },
  {
    slug: "tasks",
    title: "Tasks",
    description: "Internal tasks for your portal team.",
    highlights: [
      "Create and assign tasks",
      "Track open vs done",
      "Use tasks inside automations",
    ],
    included: true,
    accent: "ink",
  },
  {
    slug: "newsletter",
    title: "Newsletter",
    description: "Send newsletters to your contacts.",
    highlights: [
      "Build segments and send campaigns",
      "Templates and personalization",
      "Basic analytics",
    ],
    accent: "blue",
  },
  {
    slug: "nurture-campaigns",
    title: "Nurture Campaigns",
    description: "Longer-running nurture sequences across channels.",
    highlights: [
      "Multi-step sequences",
      "Delays and conditions",
      "Simple reporting",
    ],
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
    entitlementKey: "booking",
    accent: "ink",
    hidden: true,
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
    slug: "ai-outbound-calls",
    title: "AI Outbound Calls",
    description: "Automatically place outbound calls when a contact is tagged.",
    highlights: [
      "Choose tags to target",
      "Call script + simple logging",
      "Works with automations",
    ],
    entitlementKey: "leadOutbound",
    accent: "coral",
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
    hidden: true,
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
