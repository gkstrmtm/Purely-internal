export type PortalSupportServiceGuide = {
  slug: string;
  title: string;
  urlPath: string;
  clickPath: string;
  quickStartSteps: string[];
  commonTasks?: string[];
  troubleshooting?: string[];
};

// This is a deliberately concise but comprehensive “how to click it” manual for portal support chat.
// It is included in the support-chat prompt so the assistant can answer technical how-to questions
// across *all* services consistently.
export const PORTAL_SUPPORT_MANUAL: PortalSupportServiceGuide[] = [
  {
    slug: "portal",
    title: "Portal basics",
    urlPath: "/portal/app",
    clickPath: "Sidebar → Dashboard",
    quickStartSteps: [
      "Open Services: Sidebar → Services (/portal/app/services)",
      "Check Billing/entitlements: Sidebar → Billing (/portal/app/billing)",
      "Set business/profile details: Sidebar → Profile (/portal/app/profile)",
      "Team access: Sidebar → People (/portal/app/people)",
    ],
    troubleshooting: [
      "If a service/menu isn’t visible, confirm it’s enabled in Billing/Services.",
      "If a button is disabled, check permissions (member vs admin/owner) and required fields.",
    ],
  },

  {
    slug: "inbox",
    title: "Inbox / Outbox",
    urlPath: "/portal/app/services/inbox",
    clickPath: "Sidebar → Services → Inbox / Outbox",
    quickStartSteps: [
      "Use the left list to pick a thread (SMS/email).",
      "Reply from the thread composer; attach media via the media picker when available.",
      "Use filters/search to find a contact or conversation.",
    ],
    commonTasks: [
      "Find a conversation: use search + filters, then open the thread.",
      "Send a new message: open composer/new-thread and choose channel.",
    ],
    troubleshooting: [
      "If replies fail to send, verify the channel is connected/configured and try again.",
      "If media fails, try smaller file size and confirm the upload finished.",
    ],
  },

  {
    slug: "media-library",
    title: "Media Library",
    urlPath: "/portal/app/services/media-library",
    clickPath: "Sidebar → Services → Media Library",
    quickStartSteps: [
      "Upload: click Upload, pick file(s).",
      "Organize: create folders and move items as needed.",
      "Reuse: pick items from media pickers inside other services.",
    ],
    troubleshooting: [
      "If uploads stall, try reloading and re-uploading (network interruptions are common).",
      "If an item won’t appear in pickers, confirm it finished uploading and isn’t in a hidden folder.",
    ],
  },

  {
    slug: "tasks",
    title: "Tasks",
    urlPath: "/portal/app/services/tasks",
    clickPath: "Sidebar → Services → Tasks",
    quickStartSteps: [
      "Create a task list (if needed), then add tasks.",
      "Assign owners and due dates.",
      "Mark tasks done and review open vs completed.",
    ],
    troubleshooting: [
      "If assignments aren’t available, confirm the account has People/team set up.",
    ],
  },

  {
    slug: "reporting",
    title: "Reporting",
    urlPath: "/portal/app/services/reporting",
    clickPath: "Sidebar → Services → Reporting",
    quickStartSteps: [
      "Open reporting dashboards to view summaries.",
      "Use filters/date ranges (when available).",
      "Export/share only if the UI provides it.",
    ],
  },

  {
    slug: "funnel-builder",
    title: "Funnel Builder",
    urlPath: "/portal/app/services/funnel-builder",
    clickPath: "Sidebar → Services → Funnel Builder",
    quickStartSteps: [
      "Create a funnel, then add/edit pages.",
      "Add forms to capture leads.",
      "Publish and connect a domain when ready.",
    ],
    troubleshooting: [
      "If publish options aren’t visible, confirm domain/settings are completed in Profile or the funnel settings.",
    ],
  },

  {
    slug: "automations",
    title: "Automation Builder",
    urlPath: "/portal/app/services/automations",
    clickPath: "Sidebar → Services → Automation Builder",
    quickStartSteps: [
      "Create a workflow.",
      "Choose a trigger, then add steps (SMS/email/tasks/etc.).",
      "Enable the workflow after testing.",
    ],
    troubleshooting: [
      "If steps won’t run, confirm the workflow is enabled and the trigger conditions are actually met.",
      "If messages fail, confirm channel integrations are configured.",
    ],
  },

  {
    slug: "booking",
    title: "Booking Automation",
    urlPath: "/portal/app/services/booking",
    clickPath: "Sidebar → Services → Booking Automation",
    quickStartSteps: [
      "Set availability rules.",
      "Connect a calendar (if required by UI).",
      "Configure reminders/follow-ups.",
      "Share the booking link and test a booking end-to-end.",
    ],
    troubleshooting: [
      "If times aren’t available, check timezone, availability windows, and connected calendar conflicts.",
    ],
  },

  {
    slug: "newsletter",
    title: "Newsletter",
    urlPath: "/portal/app/services/newsletter",
    clickPath: "Sidebar → Services → Newsletter",
    quickStartSteps: [
      "Create/select an audience.",
      "Compose newsletter (AI or manual mode depending on UI).",
      "Preview, then send or schedule.",
    ],
    troubleshooting: [
      "If send is disabled, confirm audience has recipients and required sender settings are set.",
    ],
  },

  {
    slug: "nurture-campaigns",
    title: "Nurture Campaigns",
    urlPath: "/portal/app/services/nurture-campaigns",
    clickPath: "Sidebar → Services → Nurture Campaigns",
    quickStartSteps: [
      "Create a campaign.",
      "Add steps (delays + actions).",
      "Enroll contacts (manual or rules-based depending on UI).",
      "Enable and monitor results.",
    ],
    troubleshooting: [
      "If a contact doesn’t receive steps, check enrollment status, campaign enabled state, and step schedules.",
    ],
  },

  {
    slug: "blogs",
    title: "Automated Blogs",
    urlPath: "/portal/app/services/blogs",
    clickPath: "Sidebar → Services → Automated Blogs",
    quickStartSteps: [
      "Set branding/settings.",
      "Generate drafts (AI) and review.",
      "Schedule or publish.",
    ],
  },

  {
    slug: "reviews",
    title: "Reviews",
    urlPath: "/portal/app/services/reviews",
    clickPath: "Sidebar → Services → Reviews",
    quickStartSteps: [
      "Configure review request template.",
      "Choose who to send to, then send requests.",
      "Monitor replies and respond (if supported in UI).",
    ],
  },

  {
    slug: "lead-scraping",
    title: "Lead Scraping",
    urlPath: "/portal/app/services/lead-scraping",
    clickPath: "Sidebar → Services → Lead Scraping",
    quickStartSteps: [
      "Enter search criteria (industry/location/filters).",
      "Run scrape/search to fetch leads.",
      "Review and import/assign leads (if supported).",
    ],
    troubleshooting: [
      "If results are empty, broaden filters and verify the query fields are valid.",
    ],
  },

  {
    slug: "ai-receptionist",
    title: "AI Receptionist",
    urlPath: "/portal/app/services/ai-receptionist",
    clickPath: "Sidebar → Services → AI Receptionist",
    quickStartSteps: [
      "Configure voice behavior (system prompt, routing fields).",
      "Configure SMS behavior (enable SMS, set SMS prompt) if needed.",
      "Sync to apply changes to the agent.",
      "Test calls/SMS from the testing tools (if available in UI).",
    ],
    commonTasks: [
      "Knowledge base (Voice/SMS): set Seed URL → choose Crawl depth (0–5) + Max URLs (0–1000) → add Notes/Upload file → Sync knowledge base.",
      "Manual agent override: if a manual agent ID is set, Sync/KB Sync applies to that agent ID.",
    ],
    troubleshooting: [
      "If Sync says API key missing, set it in Profile first, then retry Sync.",
      "If KB sync ingests but doesn’t affect behavior, verify you synced and that the effective agent ID is correct.",
    ],
  },

  {
    slug: "ai-outbound-calls",
    title: "AI Outbound Calls",
    urlPath: "/portal/app/services/ai-outbound-calls",
    clickPath: "Sidebar → Services → AI outbound",
    quickStartSteps: [
      "Select a campaign.",
      "Configure Calls agent (voice) and Sync.",
      "Configure Messages agent (SMS/email) and Sync.",
      "Use Testing to validate the effective agent IDs.",
    ],
    commonTasks: [
      "Campaign knowledge base (Calls/Messages): set Seed URL → Crawl depth (0–5) + Max URLs (0–1000) → Notes/Upload → Sync knowledge base.",
      "Manual agent override: if manual Calls/Messages agent ID is set, Sync/KB Sync applies to that manual agent ID.",
    ],
    troubleshooting: [
      "If campaigns fail to load, it can be a backend or schema issue — use Report bug with the exact error.",
      "If Testing shows no agent ID, Sync the agent first (or set a manual agent ID override).",
    ],
  },

  // Credit variant services (still listed so support chat knows they exist).
  {
    slug: "dispute-letters",
    title: "Dispute Letters",
    urlPath: "/portal/app/services/dispute-letters",
    clickPath: "Sidebar → Services → Dispute Letters (credit mode)",
    quickStartSteps: [
      "Pick a contact.",
      "Generate a letter (AI) then edit.",
      "Send/export as supported by UI.",
    ],
  },
  {
    slug: "credit-reports",
    title: "Credit Reports",
    urlPath: "/portal/app/services/credit-reports",
    clickPath: "Sidebar → Services → Credit Reports (credit mode)",
    quickStartSteps: [
      "Import a credit report.",
      "Audit and tag items.",
      "Track dispute status.",
    ],
  },
];

export function portalSupportManualText(): string {
  const sections: string[] = [];
  for (const g of PORTAL_SUPPORT_MANUAL) {
    sections.push(
      [
        `SERVICE: ${g.title}`,
        `- Slug: ${g.slug}`,
        `- URL: ${g.urlPath}`,
        `- Click path: ${g.clickPath}`,
        `- Quick start:`,
        ...g.quickStartSteps.map((s) => `  - ${s}`),
        ...(g.commonTasks && g.commonTasks.length
          ? ["- Common tasks:", ...g.commonTasks.map((s) => `  - ${s}`)]
          : []),
        ...(g.troubleshooting && g.troubleshooting.length
          ? ["- Troubleshooting:", ...g.troubleshooting.map((s) => `  - ${s}`)]
          : []),
      ].join("\n"),
    );
  }

  sections.push(
    [
      "GLOBAL LIMITS:",
      "- Knowledge base Crawl depth max: 5",
      "- Knowledge base Max URLs max: 1000",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
