export type PortalSupportServiceGuide = {
  slug: string;
  title: string;
  urlPath: string;
  clickPath: string;
  quickStartSteps: string[];
  commonTasks?: string[];
  troubleshooting?: string[];
  tags?: string[];
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
    tags: ["portal", "dashboard", "navigation", "sidebar"],
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
    slug: "services-home",
    title: "Services home",
    urlPath: "/portal/app/services",
    clickPath: "Sidebar → Services",
    tags: ["services", "service", "modules", "apps"],
    quickStartSteps: [
      "Use the service cards to open a service.",
      "If a service card is missing, it may not be enabled for your account.",
      "If you were sent a direct link to a service, open it and then use the sidebar to navigate back to Services.",
    ],
    troubleshooting: [
      "If a service isn’t visible, check Billing for module enablement (and confirm you’re in the correct portal variant).",
    ],
  },

  {
    slug: "billing",
    title: "Billing",
    urlPath: "/portal/app/billing",
    clickPath: "Sidebar → Billing",
    tags: ["billing", "plan", "subscription", "credits", "enable", "entitlement"],
    quickStartSteps: [
      "Open Billing to see which modules are enabled and whether the account is subscription vs credits-only.",
      "Enable a module (if the UI offers it), then return to Services and refresh.",
    ],
    troubleshooting: [
      "If a feature/button is missing, it’s often because the module isn’t enabled or the user role doesn’t have edit permissions.",
    ],
  },

  {
    slug: "profile",
    title: "Profile",
    urlPath: "/portal/app/profile",
    clickPath: "Sidebar → Profile",
    tags: ["profile", "settings", "integrations", "twilio", "webhooks"],
    quickStartSteps: [
      "Set basic contact info (name/phone/city/state) so automation messages and routing can work consistently.",
      "Open Advanced to access integrations and copy/paste webhook values when available.",
      "If you’re configuring calling/SMS, check Advanced → Twilio and Advanced → Webhooks.",
    ],
    troubleshooting: [
      "If you can’t edit a section, your role may be view-only (ask an owner/admin).",
    ],
  },

  {
    slug: "people",
    title: "People / Team",
    urlPath: "/portal/app/people",
    clickPath: "Sidebar → People",
    tags: ["people", "team", "members", "permissions", "roles"],
    quickStartSteps: [
      "Invite team members (if enabled) and assign the correct role.",
      "Use People when services need an owner/assignee for tasks, routing, or handoff.",
    ],
    troubleshooting: [
      "If assignments/owners aren’t available in a service, confirm People is set up and you have the right permissions.",
    ],
  },

  {
    slug: "onboarding",
    title: "Onboarding",
    urlPath: "/portal/app/onboarding",
    clickPath: "Sidebar → Onboarding",
    tags: ["onboarding", "setup", "getting started"],
    quickStartSteps: [
      "Complete the onboarding checklist to enable core modules and set required account details.",
      "If a service says setup is missing, come here and complete the related step.",
    ],
  },

  {
    slug: "inbox",
    title: "Inbox / Outbox",
    urlPath: "/portal/app/services/inbox",
    clickPath: "Sidebar → Services → Inbox / Outbox",
    tags: ["inbox", "outbox", "sms", "email", "messages", "threads"],
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
    tags: ["media", "uploads", "files", "images", "library"],
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
    tags: ["tasks", "to do", "assign", "due date"],
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
    tags: ["reporting", "analytics", "dashboard"],
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
    tags: ["funnel", "landing page", "forms", "publish", "domain"],
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
    tags: ["automation", "workflow", "trigger", "steps"],
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
    tags: ["booking", "appointments", "calendar", "availability", "reminders", "follow up"],
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
    slug: "appointment-reminders",
    title: "Appointment Reminders",
    urlPath: "/portal/app/services/appointment-reminders",
    clickPath: "Sidebar → Services → Booking Automation → Reminders tab",
    tags: ["appointment", "reminder", "reminders", "booking"],
    quickStartSteps: [
      "Open Booking Automation.",
      "Open the Reminders tab.",
      "Enable reminders and set the timing (example: 24 hours before + 2 hours before).",
      "Customize the reminder message template and save.",
      "Test: create a test booking and verify the reminder schedule is correct.",
    ],
    troubleshooting: [
      "If reminders don’t send, confirm messaging/SMS is configured and the contact has a valid phone number.",
      "If timing looks wrong, confirm timezone and that the reminder delay is set relative to the appointment time.",
    ],
  },

  {
    slug: "follow-up",
    title: "Follow-up Automation",
    urlPath: "/portal/app/services/follow-up",
    clickPath: "Sidebar → Services → Booking Automation → Follow-up tab",
    tags: ["follow up", "follow-up", "sequence", "booking"],
    quickStartSteps: [
      "Open Booking Automation.",
      "Open the Follow-up tab.",
      "Enable follow-up and configure the sequence (delay + message).",
      "Save, then run a test booking to confirm the follow-up triggers.",
    ],
    troubleshooting: [
      "If follow-ups don’t trigger, confirm the booking completed successfully and the follow-up feature is enabled.",
    ],
  },

  {
    slug: "newsletter",
    title: "Newsletter",
    urlPath: "/portal/app/services/newsletter",
    clickPath: "Sidebar → Services → Newsletter",
    tags: ["newsletter", "audience", "email", "send", "schedule"],
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
    tags: ["nurture", "campaign", "sequence", "drip"],
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
    tags: ["blogs", "blog", "seo", "publish", "draft"],
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
    tags: ["reviews", "review request", "google", "replies"],
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
    tags: ["lead", "scraping", "prospects", "search"],
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
    tags: ["ai receptionist", "receptionist", "calls", "voice", "sms", "agent", "knowledge base"],
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
    tags: ["ai outbound", "outbound calls", "campaign", "agent", "calls", "messages", "knowledge base"],
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

  {
    slug: "missed-call-textback",
    title: "Missed-Call Text Back",
    urlPath: "/portal/app/services/missed-call-textback",
    clickPath: "Sidebar → Services → Missed-Call Text Back",
    tags: ["missed call", "text back", "textback", "sms", "webhook", "twilio"],
    quickStartSteps: [
      "Enable Missed-Call Text Back.",
      "Set the reply delay and reply message body (use variables if available).",
      "Optional: attach media and/or set a forwarding phone number.",
      "Save settings.",
      "Test: call your business number and let it ring/miss; then check the Events/Activity list to confirm an SMS was sent.",
    ],
    commonTasks: [
      "If you need the webhook URL, open the Missed-Call Text Back page and copy the webhook URL/token shown in the UI.",
      "Use the variable picker to personalize the reply (lead name, callback link, etc.).",
    ],
    troubleshooting: [
      "If it says it’s not enabled, open Billing and enable the AI Receptionist module (this feature is tied to calling/SMS setup).",
      "If SMS shows FAILED in Events, confirm Twilio is configured in Profile → Advanced → Twilio.",
      "If calls aren’t triggering events, confirm your call webhooks are set in Profile → Advanced → Webhooks and pasted into your Twilio phone number settings.",
    ],
  },

  {
    slug: "integrations-twilio",
    title: "Calling/SMS integration (Twilio)",
    urlPath: "/portal/app/profile",
    clickPath: "Sidebar → Profile → Advanced → Twilio/Webhooks",
    tags: ["twilio", "phone number", "sms", "calls", "webhooks", "account sid", "auth token"],
    quickStartSteps: [
      "Open Profile.",
      "Open Advanced.",
      "Open Twilio and paste: Account SID, Auth Token, and From number (E.164, like +15551234567), then save.",
      "Open Webhooks and copy the Calls webhook values.",
      "In Twilio Console: Phone Numbers → Manage → Active numbers → click your number → Voice & Fax → paste the Calls webhook(s) into the matching fields.",
    ],
    troubleshooting: [
      "If SMS doesn’t arrive in Inbox, confirm Twilio is configured and your Twilio number is SMS-capable.",
      "If calls don’t hit AI Receptionist, confirm the Twilio phone-number voice webhook is set to the portal’s Calls handler.",
    ],
  },

  {
    slug: "integrations-voice-agent",
    title: "Voice agent platform (ElevenLabs)",
    urlPath: "/portal/app/services/ai-receptionist",
    clickPath: "Sidebar → Services → AI Receptionist (or AI outbound) → Sync/Test",
    tags: ["elevenlabs", "11 labs", "voice agent", "agent", "sync", "test call", "voice preview"],
    quickStartSteps: [
      "Use the AI Receptionist or AI Outbound page to edit the agent behavior and click Sync.",
      "Use Testing to place a test call (or preview voice) and confirm the agent answers correctly.",
      "If a manual agent ID override is set, Sync applies to that agent ID.",
    ],
    troubleshooting: [
      "If testing can’t place a call, confirm Twilio is configured and call webhooks are pasted correctly.",
      "If Sync fails with a missing-credentials message, check Profile → Advanced for any required integration fields and try again.",
      "If behavior doesn’t change after Sync, confirm you synced the correct section (calls vs messages) and test again.",
    ],
  },

  // Credit variant services (still listed so support chat knows they exist).
  {
    slug: "dispute-letters",
    title: "Dispute Letters",
    urlPath: "/portal/app/services/dispute-letters",
    clickPath: "Sidebar → Services → Dispute Letters (credit mode)",
    tags: ["credit", "dispute", "letters"],
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
    tags: ["credit", "reports", "audit"],
    quickStartSteps: [
      "Import a credit report.",
      "Audit and tag items.",
      "Track dispute status.",
    ],
  },
];

function renderGuideText(g: PortalSupportServiceGuide): string {
  return [
    `SERVICE: ${g.title}`,
    `- Slug: ${g.slug}`,
    `- URL: ${g.urlPath}`,
    `- Click path: ${g.clickPath}`,
    `- Quick start:`,
    ...g.quickStartSteps.map((s) => `  - ${s}`),
    ...(g.commonTasks && g.commonTasks.length ? ["- Common tasks:", ...g.commonTasks.map((s) => `  - ${s}`)] : []),
    ...(g.troubleshooting && g.troubleshooting.length
      ? ["- Troubleshooting:", ...g.troubleshooting.map((s) => `  - ${s}`)]
      : []),
  ].join("\n");
}

export function portalSupportManualTextForSlugs(
  slugs: string[],
  opts: { includeGlobalLimits?: boolean } = {},
): string {
  const want = new Set(slugs.map((s) => String(s || "").trim()).filter(Boolean));
  const selected = PORTAL_SUPPORT_MANUAL.filter((g) => want.has(g.slug));

  const sections = selected.map(renderGuideText);
  if (opts.includeGlobalLimits !== false) {
    sections.push(
      [
        "GLOBAL LIMITS:",
        "- Knowledge base Crawl depth max: 5",
        "- Knowledge base Max URLs max: 1000",
      ].join("\n"),
    );
  }
  return sections.join("\n\n");
}

export function portalSupportManualText(): string {
  const sections: string[] = [];
  for (const g of PORTAL_SUPPORT_MANUAL) {
    sections.push(renderGuideText(g));
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
