import type { PortalVariant } from "@/lib/portalVariant";

export type HiddenPortalServiceClassification =
  | "internal-only"
  | "beta-excluded"
  | "parented-under-another-service"
  | "intentionally-direct-linkable";

export type HiddenPortalServiceIntent = {
  classification: HiddenPortalServiceClassification;
  parentSlug?: string;
  portalHref?: string;
  creditHref?: string;
  note: string;
};

export type PortalService = {
  slug: string;
  title: string;
  description: string;
  highlights?: string[];
  creditDescription?: string;
  creditHighlights?: string[];
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
  hiddenIntent?: HiddenPortalServiceIntent;
};

export const PORTAL_SERVICES: PortalService[] = [
  {
    slug: "funnel-builder",
    title: "Funnel Builder",
    description: "Launch high-converting funnels and capture more leads.",
    creditDescription: "Capture credit repair leads with offer pages, intake forms, and consultation funnels.",
    highlights: [
      "Build unlimited funnels and landing pages",
      "Create forms that capture qualified leads",
      "Run everything on your own branded domain",
    ],
    creditHighlights: [
      "Build credit repair offer pages and consultation funnels",
      "Capture intake details with custom forms",
      "Route new leads straight into follow-up",
    ],
    included: true,
    accent: "blue",
    variants: ["portal", "credit"],
  },
  {
    slug: "dispute-letters",
    title: "Dispute Letters",
    description: "Draft, export, and manually track credit dispute letters.",
    highlights: [
      "Pick a contact",
      "Generate a draft with AI",
      "Export the PDF after review",
      "Track mailed status manually",
    ],
    included: true,
    accent: "coral",
    variants: ["credit"],
  },
  {
    slug: "credit-reports",
    title: "Credit Reports",
    description: "Import report JSON, review items, and track dispute work.",
    highlights: [
      "Import report JSON",
      "Tag items pending / negative / positive",
      "Move dispute work into letter drafts",
    ],
    included: true,
    accent: "ink",
    variants: ["credit"],
  },
  {
    slug: "inbox",
    title: "Inbox / Outbox",
    description: "Keep every conversation in one place so you reply faster.",
    creditDescription: "Track client messages, document requests, and dispute follow-up in one inbox.",
    highlights: [
      "Keep SMS + email history together",
      "Reply with full context (no digging)",
      "Move faster with a clean team inbox",
    ],
    creditHighlights: [
      "Keep client texts and emails in one thread",
      "Track document requests and dispute follow-up",
      "Reply with the full account context in view",
    ],
    included: true,
    accent: "blue",
  },
  {
    slug: "media-library",
    title: "Media Library",
    description: "Save time reusing photos, videos, and files across campaigns.",
    creditDescription: "Keep IDs, proof docs, PDFs, and reusable assets ready for every client workflow.",
    highlights: [
      "Organize content once, reuse it everywhere",
      "Share links instantly with your team",
      "Attach media to SMS + email in seconds",
    ],
    creditHighlights: [
      "Store IDs, proof docs, PDFs, and templates",
      "Share client files quickly during intake and follow-up",
      "Keep reusable assets organized in one place",
    ],
    included: true,
    accent: "coral",
  },
  {
    slug: "tasks",
    title: "Tasks",
    description: "Keep your team aligned with clear next steps and ownership.",
    creditDescription: "Track report reviews, document requests, and client follow-up across the team.",
    highlights: [
      "Assign work and track follow-through",
      "See what’s open vs done at a glance",
      "Turn repeatable work into automations",
    ],
    creditHighlights: [
      "Assign report reviews and document collection steps",
      "Track what is waiting on the client vs your team",
      "Keep dispute follow-up moving to completion",
    ],
    included: true,
    accent: "ink",
  },
  {
    slug: "ai-receptionist",
    title: "AI Receptionist",
    description: "Stop missing calls and capture more leads automatically.",
    creditDescription: "Answer credit repair inquiries and route consultation calls automatically.",
    highlights: [
      "Never miss a call (even after-hours)",
      "Capture lead details automatically",
      "Route requests instantly to the right person",
    ],
    creditHighlights: [
      "Answer credit repair inquiries around the clock",
      "Capture intake details before the handoff",
      "Route consultation calls to the right person",
    ],
    entitlementKey: "aiReceptionist",
    accent: "blue",
  },
  {
    slug: "newsletter",
    title: "Newsletter",
    description: "Stay top-of-mind with consistent updates that drive replies.",
    creditDescription: "Send credit education and nurture updates to clients and prospects.",
    highlights: [
      "Send to the right audience with segmentation",
      "Templates + personalization that feels human",
      "Track opens and performance",
    ],
    creditHighlights: [
      "Send credit education to clients and prospects",
      "Keep follow-up content consistent between live conversations",
      "Track sends, opens, and engagement",
    ],
    entitlementKey: "newsletter",
    accent: "coral",
  },
  {
    slug: "booking",
    title: "Booking Automation",
    description: "Turn more leads into booked appointments without the back-and-forth.",
    creditDescription: "Book credit consultations and review calls without the back-and-forth.",
    highlights: [
      "Book faster with instant confirmations",
      "Route bookings using simple rules",
      "Reduce no-shows with reminders + follow-ups",
    ],
    creditHighlights: [
      "Book consultations and review calls online",
      "Capture intake details before the meeting",
      "Reduce no-shows with reminders and follow-up",
    ],
    entitlementKey: "booking",
    accent: "ink",
  },
  {
    slug: "follow-up",
    title: "Follow-up Automation",
    description: "Keep leads warm with simple, reliable touch points.",
    creditDescription: "Send document reminders and consultation follow-up without manual chasing.",
    highlights: [
      "SMS and email follow-up sequences",
      "Pipeline stage-based triggers",
      "Human handoff when needed",
    ],
    creditHighlights: [
      "Send document reminders automatically",
      "Follow up after consultations without manual chasing",
      "Trigger a handoff when a client replies",
    ],
    entitlementKey: "booking",
    accent: "ink",
    hidden: true,
    hiddenIntent: {
      classification: "parented-under-another-service",
      parentSlug: "booking",
      portalHref: "/portal/app/services/booking?tab=follow-up",
      creditHref: "/credit/app/services/booking?tab=follow-up",
      note: "Follow-up is part of Booking automation, so standalone routing should collapse into the booking follow-up tab.",
    },
  },
  {
    slug: "ai-outbound-calls",
    title: "AI outbound",
    description: "Automate outbound call follow-up without adding headcount.",
    creditDescription: "Run outreach and follow-up calls for credit consultations at scale.",
    highlights: [
      "Reach leads fast while they’re still hot",
      "Consistent messaging with a tuned script",
      "Log outcomes and trigger next steps",
    ],
    creditHighlights: [
      "Call fresh leads about credit consultations",
      "Follow up after missed calls or stalled intake",
      "Log outcomes and trigger the next step automatically",
    ],
    entitlementKey: "leadOutbound",
    accent: "blue",
  },
  {
    slug: "lead-scraping",
    title: "Lead Scraping",
    description: "Access a large database of targeted leads on demand.",
    creditDescription: "Pull targeted lead lists for credit offers and consultation outreach.",
    highlights: [
      "Pull niche + location leads in minutes",
      "Never hit the same lead twice",
      "Automatically pull and route leads on a schedule",
    ],
    creditHighlights: [
      "Build lead lists for credit offers and local campaigns",
      "Exclude duplicates before outreach starts",
      "Route new leads into consultation follow-up",
    ],
    entitlementKey: "leadScraping",
    accent: "coral",
  },
  {
    slug: "automations",
    title: "Automation Builder",
    description: "Fully customize your follow-up and ops workflows in one place.",
    creditDescription: "Automate document reminders, intake steps, and dispute follow-up workflows.",
    highlights: [
      "Create advanced sequences with simple building blocks",
      "Mix triggers, steps, and conditions for thousands of variations",
      "Save, reuse, and improve workflows over time",
    ],
    creditHighlights: [
      "Automate intake, document reminders, and follow-up",
      "Build sequences around real client workflows",
      "Reuse proven credit-service automations",
    ],
    entitlementKey: "automations",
    accent: "ink",
  },
  {
    slug: "blogs",
    title: "Automated Blogs",
    description: "Stay visible with consistent SEO content without writing every week.",
    creditDescription: "Publish credit education content that supports trust and intake.",
    highlights: [
      "Publish consistently to build authority",
      "Drafts created + scheduled automatically",
      "Quick review and edits before publishing",
    ],
    creditHighlights: [
      "Publish credit education content on a schedule",
      "Build trust around the questions prospects already ask",
      "Review and adjust drafts before publishing",
    ],
    entitlementKey: "blog",
    accent: "blue",
  },
  {
    slug: "missed-call-textback",
    title: "Missed call, text back",
    description: "Turn missed calls into conversations.",
    creditDescription: "Turn missed credit inquiries into consultation conversations.",
    highlights: [
      "Auto text within seconds",
      "Qualify intent and capture details",
      "Book or hand off to your team",
    ],
    creditHighlights: [
      "Text back missed credit inquiries in seconds",
      "Capture interest before the lead goes cold",
      "Route replies into consultation follow-up",
    ],
    entitlementKey: "aiReceptionist",
    accent: "coral",
    hidden: true,
    hiddenIntent: {
      classification: "parented-under-another-service",
      parentSlug: "ai-receptionist",
      portalHref: "/portal/app/services/ai-receptionist?tab=missed-call-textback",
      creditHref: "/credit/app/services/ai-receptionist?tab=missed-call-textback",
      note: "Missed-call text back lives inside AI Receptionist, so hidden routes should redirect into the parent tab instead of acting like a standalone service.",
    },
  },
  {
    slug: "reviews",
    title: "Reviews",
    description: "Get more reviews consistently without chasing customers.",
    creditDescription: "Collect social proof for your credit repair service without manual chasing.",
    highlights: [
      "Automatically request reviews at the right time",
      "Increase response rates with SMS-first outreach",
      "Track sends, replies, and outcomes",
    ],
    creditHighlights: [
      "Ask satisfied clients for reviews at the right time",
      "Follow up automatically after milestones",
      "Build proof for your credit repair service",
    ],
    entitlementKey: "reviews",
    accent: "coral",
  },
  {
    slug: "nurture-campaigns",
    title: "Nurture Campaigns",
    description: "Convert more leads with long-term follow-up that runs itself.",
    creditDescription: "Keep prospects and clients engaged with long-term credit education.",
    highlights: [
      "Multi-step sequences across channels",
      "Smart delays and conditions",
      "Simple performance reporting",
    ],
    creditHighlights: [
      "Keep prospects warm with credit education",
      "Run long-term follow-up after consultations",
      "See which sequences move people forward",
    ],
    entitlementKey: "nurture",
    accent: "ink",
  },
  {
    slug: "reporting",
    title: "Reporting",
    description: "See what’s working, what ran, and where you’re saving time.",
    creditDescription: "Track leads, consultations, dispute activity, and conversion signals in one place.",
    highlights: [
      "Weekly hours-saved snapshot",
      "Service activity summaries",
      "Export-ready reporting",
    ],
    creditHighlights: [
      "Track leads, consultations, and dispute work",
      "See service activity in one credit workspace",
      "Export the numbers your team needs",
    ],
    included: true,
    accent: "blue",
  },
];

export function getPortalServiceCopy(service: PortalService, variant: PortalVariant) {
  return {
    description: variant === "credit" ? service.creditDescription ?? service.description : service.description,
    highlights: variant === "credit" ? service.creditHighlights ?? service.highlights ?? [] : service.highlights ?? [],
  };
}

export function getPortalHiddenServiceHref(service: PortalService, variant: PortalVariant) {
  if (!service.hiddenIntent) return null;
  return variant === "credit" ? service.hiddenIntent.creditHref ?? null : service.hiddenIntent.portalHref ?? null;
}

export function getPortalServiceBenefitCopy(
  serviceSlug: string,
  entitlementKey?: string,
  variant: PortalVariant = "portal",
) {
  const key = (entitlementKey || "").trim();

  if (variant === "credit") {
    if (serviceSlug === "funnel-builder") {
      return {
        title: "Capture credit repair leads and route them into intake",
        bullets: [
          "Launch offer pages for credit repair and consultations",
          "Collect intake details before a live conversation",
          "Route new leads into follow-up automatically",
          "Keep the funnel tied to the rest of your credit workspace",
        ],
      };
    }

    if (serviceSlug === "inbox" || key === "crm") {
      return {
        title: "Keep dispute follow-up moving without losing context",
        bullets: [
          "Keep client messages and document requests together",
          "See email and SMS history in one place",
          "Reply with the full account context on screen",
          "Hand work off cleanly across the team",
        ],
      };
    }

    if (serviceSlug === "media-library") {
      return {
        title: "Keep client documents and reusable files ready",
        bullets: [
          "Store IDs, proof docs, PDFs, and templates centrally",
          "Reuse files during intake, reviews, and follow-up",
          "Share the right document fast when a client replies",
          "Keep assets organized across the whole credit workspace",
        ],
      };
    }

    if (serviceSlug === "tasks") {
      return {
        title: "Keep reviews, document collection, and follow-up on track",
        bullets: [
          "Assign report reviews and dispute prep clearly",
          "Track what is waiting on a client vs your team",
          "Keep next steps visible after every consultation",
          "Stop repeat work from falling through the cracks",
        ],
      };
    }

    if (serviceSlug === "blogs" || key === "blog") {
      return {
        title: "Teach prospects how your credit process works",
        bullets: [
          "Publish credit education without writing from scratch each week",
          "Build trust before someone books a consultation",
          "Cover the questions prospects already ask your team",
          "Keep authority content moving on a schedule you control",
        ],
      };
    }

    if (serviceSlug === "booking" || key === "booking") {
      return {
        title: "Book consultations and review calls without back-and-forth",
        bullets: [
          "Share a clean booking flow for credit consultations",
          "Capture intake details before the meeting starts",
          "Reduce no-shows with reminders and follow-up",
          "Keep booked calls tied to the rest of the client workflow",
        ],
      };
    }

    if (serviceSlug === "follow-up") {
      return {
        title: "Keep document reminders and consultation follow-up moving",
        bullets: [
          "Send reminder sequences without manual chasing",
          "Follow up after calls while details are still fresh",
          "Trigger a handoff when a client responds",
          "Keep every touch point tied to the same workspace",
        ],
      };
    }

    if (serviceSlug === "reviews" || key === "reviews") {
      return {
        title: "Turn finished client wins into usable social proof",
        bullets: [
          "Ask for reviews at the right point in the client journey",
          "Follow up automatically instead of remembering manually",
          "Track outreach and responses in one place",
          "Build proof that supports future consultations",
        ],
      };
    }

    if (serviceSlug === "ai-receptionist" || key === "aiReceptionist") {
      return {
        title: "Answer credit inquiries before they go cold",
        bullets: [
          "Handle credit repair questions around the clock",
          "Collect intake details before handing off to the team",
          "Route consultations to the right person faster",
          "Keep call activity inside the same workspace",
        ],
      };
    }

    if (serviceSlug === "missed-call-textback") {
      return {
        title: "Turn missed credit calls into booked conversations",
        bullets: [
          "Text back quickly when a consultation call is missed",
          "Capture details while the lead is still engaged",
          "Route replies into the next step automatically",
          "Keep handoff clean for the rest of the team",
        ],
      };
    }

    if (serviceSlug === "ai-outbound-calls" || key === "leadOutbound") {
      return {
        title: "Run consultation outreach without building a call team",
        bullets: [
          "Call fresh leads while the credit offer is still top of mind",
          "Follow up after missed calls or stalled intake",
          "Keep messaging consistent across every outreach attempt",
          "Log outcomes and trigger the right next step",
        ],
      };
    }

    if (serviceSlug === "lead-scraping" || key === "leadScraping") {
      return {
        title: "Build targeted lead lists for credit offers",
        bullets: [
          "Pull local lead lists for consultation outreach",
          "Exclude duplicates before the team starts follow-up",
          "Route new leads into intake and nurture automatically",
          "Keep sourcing tied to the rest of the workspace",
        ],
      };
    }

    if (serviceSlug === "automations" || key === "automations") {
      return {
        title: "Systemize intake, document collection, and dispute follow-up",
        bullets: [
          "Automate reminders and handoffs around real client workflows",
          "Trigger the right next step after every intake milestone",
          "Reuse proven sequences instead of rebuilding them each time",
          "Keep operations consistent as volume grows",
        ],
      };
    }

    if (serviceSlug === "newsletter" || key === "newsletter") {
      return {
        title: "Educate prospects and clients between live conversations",
        bullets: [
          "Send credit education that supports consultations",
          "Stay visible while prospects decide what to do next",
          "Keep clients informed without ad hoc messages",
          "Track engagement from one workspace",
        ],
      };
    }

    if (serviceSlug === "nurture-campaigns" || key === "nurture") {
      return {
        title: "Stay in front of leads until they are ready",
        bullets: [
          "Run long-term credit education sequences automatically",
          "Follow up after consultations without starting from scratch",
          "Keep prospects warm while they gather documents and context",
          "Measure which nurture paths move people forward",
        ],
      };
    }

    if (serviceSlug === "reporting") {
      return {
        title: "See lead flow, consultations, and dispute work in one place",
        bullets: [
          "Track lead, booking, and follow-up activity together",
          "See how report reviews and dispute work are moving",
          "Spot where clients stall or convert",
          "Export numbers the team can act on",
        ],
      };
    }
  }

  if (serviceSlug === "blogs" || key === "blog") {
    return {
      title: "Turn your website into a lead engine",
      bullets: [
        "Publish consistent, SEO-ready content without the weekly grind",
        "Generate on-brand drafts from your topics and goals",
        "Keep momentum with an automation schedule you control",
        "Build trust with prospects before they ever talk to you",
      ],
    };
  }

  if (serviceSlug === "booking" || key === "booking") {
    return {
      title: "Book more appointments with less back-and-forth",
      bullets: [
        "Share a clean booking link that works 24/7",
        "Capture the details you need up-front",
        "Reduce no-shows with reminders",
        "Stay organized with a single source of truth",
      ],
    };
  }

  if (serviceSlug === "follow-up" || key === "crm") {
    return {
      title: "Follow up faster (and never drop leads)",
      bullets: [
        "Automate follow-ups so every lead gets touched",
        "Standardize messaging while staying personal",
        "See what’s working and iterate",
        "Spend time closing, not chasing",
      ],
    };
  }

  if (serviceSlug === "ai-outbound-calls" || key === "leadOutbound") {
    return {
      title: "Scale outbound without hiring a call team",
      bullets: [
        "Qualify leads consistently and route the best ones",
        "Increase speed-to-lead with 24/7 coverage",
        "Keep your team focused on warm conversations",
        "Turn outbound into a predictable channel",
      ],
    };
  }

  return {
    title: "Unlock this service",
    bullets: [
      "Add it in Billing and start configuring right away",
      variant === "credit" ? "Keep everything in one credit workspace" : "Keep everything under one portal login",
      "Upgrade or remove add-ons any time",
    ],
  };
}
