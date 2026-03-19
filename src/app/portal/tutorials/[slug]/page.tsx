import Link from "next/link";
import { notFound } from "next/navigation";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { IconServiceGlyph } from "@/app/portal/PortalIcons";
import { requirePortalUser } from "@/lib/portalAuth";
import { getTutorialPhotoUrls, getTutorialVideoUrl } from "@/lib/portalTutorialVideos";

type TutorialSection = {
  title: string;
  body: string;
  steps?: string[];
};

type TutorialConfig = {
  intro?: string;
  sections: TutorialSection[];
};

type TutorialUiService = {
  slug: string;
  title: string;
  description: string;
  accent: "blue" | "coral" | "ink";
};

const CORE_TUTORIAL_PAGES: Record<string, TutorialUiService> = {
  "getting-started": {
    slug: "getting-started",
    title: "Getting started",
    description: "Quick tour of how the portal fits together and what to do first.",
    accent: "blue",
  },
  dashboard: {
    slug: "dashboard",
    title: "Dashboard",
    description: "Snapshot of what is live and how much time your automations are saving.",
    accent: "blue",
  },
  people: {
    slug: "people",
    title: "People",
    description: "Contacts and basics about who you are talking to.",
    accent: "coral",
  },
  billing: {
    slug: "billing",
    title: "Billing",
    description: "Plan, invoices, and credit balance for this portal account.",
    accent: "ink",
  },
  credits: {
    slug: "credits",
    title: "Credits",
    description: "How usage-based credits work in your account.",
    accent: "ink",
  },
  profile: {
    slug: "profile",
    title: "Profile",
    description: "Account details, notification preferences, and integrations for this login.",
    accent: "blue",
  },
};

const TUTORIALS: Record<string, TutorialConfig> = {
  "funnel-builder": {
    intro:
      "Funnel Builder lets you publish funnels, landing pages, and lead-capture forms (optionally on your own domain), then track responses and route leads into the rest of the portal.",
    sections: [
      {
        title: "Key concepts (so the UI makes sense)",
        body: "Funnel Builder has three main areas: Funnels, Forms, and Settings. Most setup issues come from domain/DNS status, funnel status, or Stripe not being connected.",
        steps: [
          "Funnels are public pages you publish (typically DRAFT / ACTIVE / ARCHIVED).",
          "Forms are lead-capture assets with their own editor, preview, and responses list.",
          "Domains are added and verified in Settings. A funnel can be assigned to a verified domain to go live.",
          "Root behavior controls what happens at the root of your domain (/, for example yourdomain.com).",
          "Stripe is optional: connect it if your funnel includes payments/checkout behavior.",
        ],
      },
      {
        title: "Create your first funnel (end-to-end)",
        body: "Start by creating a funnel, editing it, then setting it to ACTIVE once you are ready to share it.",
        steps: [
          "Open Services → Funnel Builder.",
          "Stay on the Funnels tab.",
          "Click Create and enter a Name and a Slug (the slug becomes part of the URL).",
          "Open the funnel to edit the content and layout.",
          "Use Preview (or open-in-new-tab) to check how the public page renders.",
          "When ready, set the funnel status to ACTIVE.",
          "Optional: assign a verified custom domain to make the funnel live on your branding.",
        ],
      },
      {
        title: "Assign a domain and go live",
        body: "A funnel is only truly live on your custom domain after the domain is verified and assigned.",
        steps: [
          "In Funnel Builder, open Settings → Domains.",
          "Add your domain (apex like yourdomain.com or subdomain like go.yourdomain.com).",
          "Follow the DNS instructions shown (record type + host + value).",
          "After DNS is set, click Verify domain in the portal.",
          "Once the domain is VERIFIED, go back to Funnels and assign that domain to the funnel.",
          "Confirm the funnel shows as LIVE (or similar) once verification and assignment are complete.",
        ],
      },
      {
        title: "Create and manage forms",
        body: "Forms are first-class assets: you can edit them, preview them, view responses, and delete them independently of funnels.",
        steps: [
          "Open Funnel Builder → Forms tab.",
          "Click Create to add a new form (Name + Slug).",
          "Open the form to edit fields and layout.",
          "Use the three-dot menu on a form for actions like Edit, Responses, Preview, and Delete.",
          "Use Responses to review submissions and copy details into follow-up workflows.",
          "Delete forms you no longer use to keep the list clean (deleting is permanent).",
        ],
      },
      {
        title: "Stripe payments (optional)",
        body: "If you plan to collect payments in funnels, connect Stripe first so checkout components work reliably.",
        steps: [
          "In Funnel Builder settings, find the Stripe integration status.",
          "Click to connect/configure Stripe and complete the Stripe onboarding steps.",
          "Return to Funnel Builder and refresh the Stripe status card to confirm it shows connected/configured.",
          "Run a small end-to-end test (preview the funnel and test the payment flow) before sending traffic.",
        ],
      },
      {
        title: "Domain root behavior (Directory / Redirect / Disabled)",
        body: "Root behavior controls what someone sees at your domain root (/) independent of any one funnel slug.",
        steps: [
          "Open Funnel Builder → Settings → Domains.",
          "For a domain, choose Root mode:",
          "- DIRECTORY: show a directory-style landing that lists available funnels.",
          "- REDIRECT: send / to a specific funnel or URL.",
          "- DISABLED: do not serve content at / (useful if your root is handled elsewhere).",
          "If using REDIRECT, set the redirect target and test in an incognito window.",
          "If using DIRECTORY, keep funnel names/slugs clean because they become public-facing.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "Most issues are setup-related. Use this checklist before digging deeper.",
        steps: [
          "Domain stuck on PENDING: DNS may not have propagated yet. Re-check record type/host/value, then verify again after a few minutes.",
          "Wrong host label in DNS: some registrars use @ for apex. Match the portal-provided record exactly as your registrar expects.",
          "Funnel not visible: confirm the funnel status is ACTIVE (not DRAFT/ARCHIVED).",
          "Payments failing: confirm Stripe is configured and re-test with a small controlled scenario.",
          "Form responses missing: confirm users submitted the correct form URL and that you are in the correct portal account.",
        ],
      },
    ],
  },
  inbox: {
    intro:
      "Inbox / Outbox keeps email and SMS threads in one place so your team can reply quickly, keep context attached to the contact, and avoid losing conversations across tools.",
    sections: [
      {
        title: "Key concepts (channels, boxes, threads)",
        body: "Inbox supports two channels (Email and SMS). Email also supports boxes (Inbox / Sent / All). Each thread is a conversation with a contact, including history and attachments.",
        steps: [
          "Email channel: use Inbox to focus on inbound messages, Sent to review outbound, and All to see everything.",
          "SMS channel: threads are grouped by phone number; inbound and outbound live together.",
          "Thread details: read history, reply, attach files, and use variables for personalization.",
          "Contact context: threads can show contact details and tags so your team knows who they are talking to.",
        ],
      },
      {
        title: "Daily workflow (work the queue)",
        body: "The fastest workflow is: scan → open thread → reply → add tags/notes → move on.",
        steps: [
          "Open Services → Inbox / Outbox.",
          "Switch between Email and SMS.",
          "(Email) Pick Inbox / Sent / All depending on what you are doing.",
          "Click a thread to open it and read the full history.",
          "Reply in the composer. Use Insert variable if you want personalization.",
          "Attach files from your computer, or open the Media picker to reuse assets from Media Library.",
          "Send your reply and confirm it appears in the thread timeline.",
          "Update contact tags when a conversation changes state (for example: Interested, Needs quote, Booked, Not a fit).",
        ],
      },
      {
        title: "Start a new message (compose)",
        body: "Compose lets you start an outbound email or SMS without waiting for an inbound message.",
        steps: [
          "Click Compose.",
          "Enter the recipient (email address for Email, phone number for SMS).",
          "Write your subject (Email only) and message body.",
          "Use Insert variable to drop in contact fields (name, phone, custom variables) safely.",
          "Attach media/files if needed.",
          "Send, then confirm the thread appears in the list.",
        ],
      },
      {
        title: "Settings (webhooks + Twilio)",
        body: "Settings shows your webhook token and Twilio connection status so inbound SMS can be routed into the portal.",
        steps: [
          "Open the Settings section inside Inbox / Outbox.",
          "Copy the webhook token if you need to authenticate inbound integrations.",
          "If SMS is enabled, confirm Twilio is configured and a From number is present.",
          "Copy the Twilio inbound SMS webhook URL shown in the portal.",
          "In Twilio, open your phone number → Messaging and set the inbound webhook to the portal URL (HTTP POST).",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When something feels off, walk through these checks.",
        steps: [
          "New emails not showing: refresh first, then confirm the correct email account is connected for this portal account.",
          "SMS inbound missing: confirm Twilio is connected and the inbound SMS webhook URL matches the portal setting.",
          "Cannot send: confirm the recipient address/number is valid and required fields (subject for email) are filled.",
          "Attachments not appearing: try a smaller file and confirm it uploads before sending.",
          "Variables render wrong: use the variable picker and confirm the contact has those fields populated in People.",
          "Teammate cannot see threads: confirm they are in the same portal account/workspace.",
        ],
      },
    ],
  },
  "media-library": {
    intro: "Store photos, videos, and files once, then reuse them across emails, SMS, blogs, newsletters, nurture campaigns, and anywhere you can attach media.",
    sections: [
      {
        title: "What Media Library is",
        body: "Media Library is shared storage for your portal account. The goal is: upload once, reuse everywhere, keep links stable, and avoid re-uploading assets.",
        steps: [
          "Folders help you organize assets for reuse (logos, templates, promotions, before/after, testimonials).",
          "Items support actions like rename, move, delete, copy share URL, and download.",
          "Search works best when names are short and consistent.",
        ],
      },
      {
        title: "Upload and organize (every action)",
        body: "This is the core workflow: create a folder structure once, then keep new assets flowing into it.",
        steps: [
          "Open Media Library from Services.",
          "Create a folder (for example: Logos, Testimonials, Promotions, Blog Images).",
          "Open a folder and upload files using the Upload button (or drag-and-drop if supported).",
          "Rename folders or items to keep names short and searchable.",
          "Move items between folders when you reorganize.",
          "Copy share URL when you need a link you can paste elsewhere.",
          "Download when you need the original file locally.",
          "Delete items you no longer want available (deleting is permanent).",
        ],
      },
      {
        title: "Reuse media in other tools",
        body: "Anywhere you can attach a file or image in the portal, use the media picker to pull from Media Library instead of uploading again.",
        steps: [
          "In Inbox, use Attach → Media Library (or similar) to attach assets.",
          "In Blogs and Newsletters, use the media picker for images to keep assets centralized.",
          "In Nurture Campaign steps, attach files/images from Media Library when supported.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If something does not show up when you expect it:",
        steps: [
          "Upload failures: try a smaller file first, then retry.",
          "Cannot find an item: search by partial name, then confirm it was uploaded in this portal account.",
          "Links not working: re-copy the share URL and test in an incognito window.",
          "Media not rendering in previews: send a test message to yourself to confirm how it appears to a real recipient.",
        ],
      },
    ],
  },
  tasks: {
    intro:
      "Tasks is your human handoff layer: when an automation needs a person (call, quote, follow-up, review), it creates or routes a task so nothing falls through.",
    sections: [
      {
        title: "What Tasks supports",
        body: "Tasks supports creating tasks, assigning them, marking done/undo, and reopening completed tasks.",
        steps: [
          "Open tasks are your day-to-day queue.",
          "Done tasks are your audit trail and allow reopening if something changes.",
          "Some tasks are assigned to everyone (unassigned); each viewer can mark done/undo independently.",
        ],
      },
      {
        title: "Create a task (manual)",
        body: "Use manual tasks for one-off situations; use Automation Builder to create them automatically for repeatable events.",
        steps: [
          "Open Tasks from Services.",
          "Click Create task.",
          "Enter a clear title (what done looks like).",
          "Choose an assignee (or leave unassigned if it should be visible to everyone).",
          "Create the task and confirm it appears in Open.",
        ],
      },
      {
        title: "Work the list (mark done / undo / reopen)",
        body: "Tasks stays useful only if the status stays accurate.",
        steps: [
          "In Open, click Mark done when you complete a task.",
          "For everyone-assigned tasks, use Undo if you accidentally marked done (it only affects your view).",
          "In Done, click Reopen to move a task back to Open if it becomes active again.",
          "If you can edit the assignee, change it when ownership changes.",
          "If the list feels stale after a status change, wait a moment or reload the page.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When tasks do not look right:",
        steps: [
          "No tasks created by automations: open Automation Builder and confirm the automation is saved and not paused.",
          "Assignee dropdown missing: some tasks may restrict assignee edits (role/permissions).",
          "Teammate cannot see tasks: confirm they are on the same portal account/workspace and have access.",
        ],
      },
    ],
  },
  "ai-receptionist": {
    intro: "AI Receptionist answers and routes inbound calls so you only handle the calls that truly need a human.",
    sections: [
      {
        title: "How it should feel",
        body: "Callers reach a consistent, friendly receptionist that can answer basic questions, collect details, and either finish the call or pass it to your team.",
      },
      {
        title: "Set up the receptionist",
        body: "Start by turning the service on and pointing your number at the portal.",
        steps: [
          "Open AI Receptionist in your portal services.",
          "Turn it on and write a greeting that sounds like your business, including your name and what you offer.",
          "Choose whether calls go to AI only or can be transferred to a human.",
          "If you forward to a person, add the transfer number in E.164 format (for example, +15551234567).",
        ],
      },
      {
        title: "Best practices for great call outcomes",
        body: "The receptionist works best when your Greeting and System prompt clearly define what you want it to do and what information it should collect.",
        steps: [
          "Business name: use the name callers expect to hear. This is used throughout the conversation.",
          "Greeting: keep it short and natural. Include your business name, ask what they need, then offer the next step.",
          "Greeting example: Hi, thanks for calling Acme Heating and Air. How can I help you today?",
          "System prompt: write the rules of the job. Tell it which services you offer, what area you serve, and what you want captured on every call.",
          "Prompt example (collect the basics): Always collect name, callback number, and the reason for the call. If it is a new lead, also ask city and preferred time window.",
          "Prompt example (existing customer): If they mention an open job, ask for the address and a short description, then offer to transfer to a human.",
          "Transfer: only enable AI transfer if you have a reliable forwarding number and you want live handoffs. Use E.164 format like +15551234567.",
          "Guard rails: tell it what not to do (for example do not quote exact pricing if you do not want it to, and do not make promises).",
        ],
      },
      {
        title: "Connect Twilio",
        body: "Twilio connects your phone number to the receptionist.",
        steps: [
          "In your Profile, add your Twilio credentials so the portal can talk to your account.",
          "Copy the Voice webhook URL from the AI Receptionist settings.",
          "In Twilio, open your phone number settings and paste that URL into the Voice webhook field, using HTTP POST.",
        ],
      },
      {
        title: "Review calls",
        body: "Use the activity view to see what the AI handled.",
        steps: [
          "Open the AI Receptionist activity tab.",
          "Click a call to see the transcript, notes, and recording.",
          "Use the notes as a quick summary and the transcript when you need full detail.",
          "If something feels off, listen to the recording to hear exactly what the caller said.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If calls or transcripts do not behave how you expect:",
        steps: [
          "If calls are hitting voicemail or a different system, double check that your Twilio number is pointing to the AI Receptionist voice webhook URL and not an old URL.",
          "If calls connect but you do not see them in the activity list, confirm you are viewing the correct portal account and Twilio project.",
          "If there is no transcript yet, wait a minute. If it still does not appear, reopen the call details or reload the page. If nothing changes, confirm that Twilio and your voice agent API key are configured in Profile.",
          "If SMS or email notifications are missing, open Profile and the AI Receptionist settings to confirm your contact phone and forwarding number are set correctly.",
        ],
      },
    ],
  },
  newsletter: {
    intro:
      "Newsletter lets you draft and send campaigns to internal users or external contacts. The workflow is designed to be simple: pick an audience, write one clear update, send.",
    sections: [
      {
        title: "Choose internal vs external",
        body: "Newsletter supports two audience types. Internal is for your own team/users. External is for contacts (customers/leads).",
        steps: [
          "Internal newsletters: audience is portal users.",
          "External newsletters: audience is contacts (often driven by tags).",
        ],
      },
      {
        title: "Create a newsletter (end-to-end)",
        body: "Create the newsletter, write content, select audience, then send.",
        steps: [
          "Open Services → Newsletter.",
          "Click Create.",
          "Choose kind: Internal or External.",
          "Write a clear subject/title and the main content.",
          "If the editor supports it, insert variables for personalization and attach media from Media Library.",
          "Select your audience (tags/contacts/emails for External; users/all-users for Internal).",
          "Send a test to yourself if test-send is available.",
          "Send (or schedule, if scheduling is enabled).",
        ],
      },
      {
        title: "Audience selection (all actions)",
        body: "Audience controls are the difference between a clean send and a messy one.",
        steps: [
          "For External: add Tags to target segments (recommended for repeatability).",
          "For External: add Contacts by searching from People.",
          "For External: add explicit Emails for one-off sends.",
          "For Internal: choose specific Users or enable Send to all users.",
          "Review the audience summary before sending.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When messages do not appear how you expect:",
        steps: [
          "If a campaign will not send, confirm your sending domain or email is verified in your account settings.",
          "If contacts say they did not receive it, check that they are actually on the list or segment you picked and that they are not unsubscribed.",
          "Always send a test email to yourself before a big send so you can see how it looks in a real inbox.",
          "If you do not see contacts in the picker, confirm you are creating an External newsletter.",
        ],
      },
    ],
  },
  booking: {
    intro:
      "Booking Automation gives you a hosted booking site and calendars, shows appointments, and runs reminders/follow-up rules so leads book faster and no-shows drop.",
    sections: [
      {
        title: "Core areas in Booking Automation",
        body: "Booking is typically split into: Appointments, Reminders, and Settings. Availability is edited in a dedicated availability editor.",
        steps: [
          "Appointments: view upcoming bookings (week/month views).",
          "Reminders: configure rules that send SMS/email or apply tags before/after appointments.",
          "Settings: booking site details, time zone, calendars you offer, and public link settings.",
          "Availability: set weekly hours and blocks, then save.",
        ],
      },
      {
        title: "Set up your booking site (end-to-end)",
        body: "The safest path is: configure site → create calendar(s) → set availability → test a booking → turn on reminders.",
        steps: [
          "Open Services → Booking Automation.",
          "Open Settings and confirm your public site title, time zone, and default meeting details.",
          "Create or select a booking calendar (service) and set its duration, location, and notification emails.",
          "Open Availability to set your weekly hours (and any blocks). Save changes.",
          "Copy your public booking link and run a test booking for yourself.",
          "Confirm the appointment appears in Appointments and the confirmation details look correct.",
        ],
      },
      {
        title: "Reminders (SMS / Email / Tag actions)",
        body: "Reminders are rule-based. Each reminder can send SMS, send email, or apply a tag at a scheduled offset from the appointment.",
        steps: [
          "Open Reminders.",
          "Choose a template (or start from scratch) and edit the message.",
          "Use Insert variable to personalize messages (name, time, location, links).",
          "Configure timing (for example: 24 hours before, 2 hours before, 30 minutes after).",
          "Save and run a test booking to confirm reminders queue correctly.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If bookings do not look right:",
        steps: [
          "If times show as available when you are already busy, confirm the correct calendar is connected and that busy events are visible to the portal.",
          "If no times show at all, check your availability window settings and time zone.",
          "If confirmations are not going out, check that email and SMS notifications are enabled in booking settings.",
          "If reminders are not sending, confirm reminders are enabled and your SMS/email channels are configured.",
        ],
      },
    ],
  },
  "ai-outbound-calls": {
    intro:
      "AI outbound runs outbound calling campaigns using your targeting rules, scripts, and tagging. It supports manual test calls, call/message activity, and campaign-level settings.",
    sections: [
      {
        title: "What you can do",
        body: "AI outbound is organized into Calls, Messages, and Settings. Most workflows start in Settings, then you test with Manual calls, then you activate a campaign.",
        steps: [
          "Calls: campaign list, activity counts, recent call activity, manual call testing and transcripts.",
          "Messages: message activity related to campaigns and enrollments.",
          "Settings: scripts, agent behavior, tagging rules, and campaign configuration.",
        ],
      },
      {
        title: "Create a campaign (end-to-end)",
        body: "Launch safely: create campaign → set targeting tags → write script → run manual tests → activate.",
        steps: [
          "Open Services → AI outbound calls.",
          "Click Create campaign.",
          "Set status to Draft while you configure it.",
          "Choose which contact tags enroll someone (and which tags exclude them).",
          "Write the call script and define a clear goal (book appointment, confirm details, qualify lead).",
          "Configure call-outcome tagging so results automatically update the contact for downstream automations.",
          "Run a few Manual calls and read the transcript before setting the campaign to Active.",
        ],
      },
      {
        title: "Best practices for higher quality conversations",
        body: "Outbound results mostly come down to targeting plus clear, specific wording in the call script and agent behavior fields.",
        steps: [
          "Audience tags: make them specific to intent (for example New lead, Quote requested, No-show, Past due). Avoid overly broad tags like Prospects unless you truly mean everyone.",
          "Campaign status: set to Active only when tags are correct. Keep new campaigns in Draft while you test.",
          "Call script: treat this as the opening line. One sentence of who you are, one sentence of why, then a question.",
          "Sales script example: Hi {contact.name}, this is {business.name}. You recently asked about {service}. Do you have 30 seconds so I can see what you need and help with next steps?",
          "Appointment reminder example: Hi {contact.name}, this is {business.name}. I am calling to confirm your appointment and answer any last questions. Does that still work for you?",
          "If you leave Call script blank, the agent will use its own configured first message. Use one or the other to avoid conflicting openings.",
          "First message (agent behavior): keep it conversational and short. Use it when you want a consistent opener across campaigns.",
          "Goal: be explicit about success (for example book an appointment, confirm details, qualify the lead). Include what to do if the person is not interested.",
          "Personality and tone: pick one clear style (helpful, calm, direct). Avoid asking it to be clever or overly casual.",
          "Environment: include the context the agent needs to sound informed (services offered, service area, business hours, common objections, and what the next step should be).",
          "Guard rails: write what it must not do (for example do not claim guarantees, do not discuss sensitive topics, do not pressure, and end the call politely if asked).",
          "Tools: start with Recommended until you know what you need. Add more only if you are sure the agent should use them.",
          "Always run a few Manual calls first and read the transcript so you can tighten the script and goal before activating tags at scale.",
        ],
      },
      {
        title: "Manual calls + transcript review",
        body: "Manual calls let you validate behavior without enrolling a large group. Treat transcripts as your feedback loop.",
        steps: [
          "Use Manual call to call a known test number.",
          "Verify the opener matches your script and that it collects the info you need.",
          "Adjust the prompt/script, then run another manual call.",
          "Once behavior is consistent, activate the campaign and add enrollment tags to a small group.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If calls are not going out:",
        steps: [
          "Confirm Twilio is connected in your Profile so the system can place calls.",
          "Check that the campaign you created is set to active and that there are actually contacts in the target list.",
          "If you see errors or no activity, start with a very small test list so it is easy to confirm behavior.",
        ],
      },
    ],
  },
  "lead-scraping": {
    intro:
      "Lead Scraping pulls targeted leads (B2B and, if unlocked, B2C). You can review leads, export to CSV, and optionally trigger outbound (email/SMS/calls) manually or automatically.",
    sections: [
      {
        title: "Tabs + sub-tabs (B2B vs B2C)",
        body: "Lead Scraping supports B2B and (if entitled) B2C. B2B commonly has Pull and Settings sub-tabs plus outbound configuration.",
        steps: [
          "B2B → Pull: run pulls and review results.",
          "B2B → Settings: saved filters, exclusions, schedule, and requirements (like requiring email).",
          "B2C: similar flow if unlocked.",
          "Outbound: configure templates and triggers for email/SMS/calls.",
        ],
      },
      {
        title: "Run a pull (end-to-end)",
        body: "Start with a small pull so you can validate lead quality before scheduling it.",
        steps: [
          "Open Lead Scraping from Services.",
          "Choose B2B (or B2C if unlocked).",
          "Set niche/keywords and geography.",
          "Set exclusions (names/domains/phones) so you avoid duplicates and existing customers.",
          "Choose whether email is required (higher quality but fewer results).",
          "Run a pull and review results.",
          "Apply tags to good leads so downstream workflows can target them.",
          "Export results to CSV if you need to review offline.",
        ],
      },
      {
        title: "Scheduling (set-it-and-forget-it)",
        body: "Scheduling runs pulls automatically on your chosen frequency. Always validate a manual pull first.",
        steps: [
          "Open Settings for the chosen tab (B2B/B2C).",
          "Enable the schedule toggle.",
          "Set frequency and quantity.",
          "Confirm the next run happens and that credits are sufficient.",
        ],
      },
      {
        title: "Outbound actions (manual / on scrape / on approve)",
        body: "Outbound can be triggered manually from a lead, automatically when scraped, or only after you approve.",
        steps: [
          "Configure outbound templates for Email and SMS (and Calls if unlocked).",
          "Pick a trigger mode: Manual, On scrape, or On approve.",
          "Use Insert variable to personalize with lead fields (business name, website, niche, location).",
          "When reviewing a lead, use Approve to mark it approved (and trigger outbound if configured).",
          "Use Send now actions when trigger mode is Manual.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When results do not match what you had in mind:",
        steps: [
          "Too many duplicates: tighten exclusions and confirm schedule settings are not re-pulling the same filters.",
          "Too few results: broaden keywords/geography or disable 'require email' temporarily.",
          "Scheduled job did not run: confirm schedule enabled and you have enough credits.",
          "Outbound did not send: confirm trigger mode, required channels (email/phone) exist on the lead, and settings are saved.",
        ],
      },
    ],
  },
  automations: {
    intro:
      "Automation Builder lets you build if-this-then-that workflows using triggers, actions, delays, and conditions. It is the glue between services (Inbox, Booking, Tasks, AI services, tags, and more).",
    sections: [
      {
        title: "Builder blocks (all node types)",
        body: "Automations are built from nodes. Each node has settings. Keep each automation simple, testable, and tied to one outcome.",
        steps: [
          "Trigger: what starts the automation (manual, inbound SMS, inbound email, booking, tags, missed call, etc.).",
          "Action: what the system does (send SMS, send email, create task, add/remove tag, trigger a service).",
          "Delay: wait a period (minutes/hours/days/weeks/months) before continuing.",
          "Condition: branch logic based on fields/variables (equals/contains/starts with/etc.).",
          "Note: use notes to document why a step exists (helps teams maintain workflows).",
        ],
      },
      {
        title: "Create a simple automation (recommended first build)",
        body: "Start with a single trigger and a single outcome. Expand only after it works.",
        steps: [
          "Open Automation Builder from Services.",
          "Click New automation.",
          "Pick one trigger (for example: inbound SMS).",
          "Add one action (for example: create a task or send an SMS reply).",
          "Use the variable picker to personalize messages safely.",
          "Add a delay node if you do not want immediate follow-up.",
          "Save the automation and make sure it is not paused.",
        ],
      },
      {
        title: "Conditions + delays (common advanced patterns)",
        body: "Conditions let you route different outcomes; delays let you space follow-ups and avoid spamming.",
        steps: [
          "Add a Condition node to check contact fields/tags (example: only send if contact.email exists).",
          "Add a Delay before follow-ups (for example 1 day) to keep spacing consistent.",
          "Prefer a few clear conditions over complex nested logic.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If automations do not fire:",
        steps: [
          "Confirm the automation is saved and not paused.",
          "Trigger a small test event that matches the trigger exactly.",
          "Check downstream services (Inbox/Tasks/AI services) to confirm whether actions ran.",
          "If conditions are used, temporarily simplify the automation to isolate the failing step.",
        ],
      },
    ],
  },
  blogs: {
    intro:
      "Automated Blogs lets you run a hosted blog with posts, automation rules, and settings (including optional custom domains). You can draft, generate with AI, schedule, publish, archive, and delete posts.",
    sections: [
      {
        title: "Tabs (posts / automation / settings)",
        body: "Blogs is split into Posts (your content list), Automation (how drafts are generated), and Settings (site + domain).",
        steps: [
          "Posts: create, edit, publish, schedule, archive, delete.",
          "Automation: define topics/guardrails so drafts are consistent.",
          "Settings: configure the hosted site handle and optional custom domain.",
        ],
      },
      {
        title: "Create and edit a post (end-to-end)",
        body: "Typical flow: create post → draft content → generate/adjust → set SEO → publish or schedule.",
        steps: [
          "Open Services → Automated Blogs → Posts.",
          "Create a new post (or open an existing draft).",
          "Edit title, content, and excerpt.",
          "Optional: use AI Generate to create content (review and edit before publishing).",
          "Set SEO keywords if you want the post optimized for specific search terms.",
          "Add/replace images using Media Library when possible.",
          "Publish immediately, or set a schedule time.",
          "Archive posts you no longer want visible without deleting history.",
          "Delete only when you truly want it removed permanently.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If you are not seeing drafts:",
        steps: [
          "Confirm the blog service is turned on in your Services page.",
          "Check that you have enough credits for the period when posts should be generated.",
          "Confirm automation settings are saved and cadence/topic rules are defined.",
        ],
      },
    ],
  },
  reviews: {
    intro: "Reviews help you ask at the right time and track responses.",
    sections: [
      {
        title: "How it should feel",
        body: "Requests go out right after good work is delivered, and you can see who responded and where.",
      },
      {
        title: "Set up Reviews (Requests tab)",
        body: "Configure the automation, timing, message template, and (optional) public reviews page.",
        steps: [
          "Open Services → Reviews.",
          "Click the Requests tab.",
          "Turn the main toggle to On.",
          "In Send mode, keep Auto-send after appointments enabled if you want requests to go out automatically.",
          "If you want to send requests manually, ensure Allow manual sends is enabled.",
          "In Calendars, leave All calendars on to allow all booking calendars, or turn it off and check only the calendars you want to send from.",
          "Open Timing and set the delay (for example 30 minutes) so the request sends after the appointment ends.",
          "Open SMS template, use Insert variable, and include {link} so the customer receives a working review link.",
          "Optional: add Review destinations (Google/Yelp/etc.) and select a default destination so your hosted reviews page can show multiple links.",
        ],
      },
      {
        title: "Send a manual request (Reviews tab)",
        body: "Use manual sends to handle exceptions (VIP customers, resends, or jobs that didn’t come through booking).",
        steps: [
          "In Reviews, click the Reviews tab.",
          "If you see the message that manual sends are off, go back to Requests and enable Allow manual sends.",
          "Use the search box to find a recent booking by name, email, phone, or booking ID.",
          "Pick the correct booking, confirm the calendar is allowed (if you enabled calendar filtering), then send the request.",
          "Watch for the status/result message at the top of the page so you know it was queued/sent.",
        ],
      },
      {
        title: "Host a public reviews page (optional)",
        body: "Turn on a public page to collect reviews and optionally show a photo gallery.",
        steps: [
          "In Requests, open Hosted reviews page.",
          "Enable public page.",
          "Set Hero title, subtitle, and Thank you message.",
          "Optional: toggle Show photo gallery and upload photos or Choose from media library.",
          "Use Preview public reviews page to open the live page in a new tab.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If responses look low:",
        steps: [
          "Confirm you are only sending requests to happy customers who are likely to say yes.",
          "Keep the request short and clear, with one link to the place you care about most.",
          "If requests are not sending, confirm the service is On, Auto-send is enabled (or manual sends are enabled if you’re trying to send from the Reviews tab), and your delay is not set too far out.",
          "If nothing shows up to send to, confirm you have recent bookings and that calendar filtering is not blocking the booking’s calendar.",
        ],
      },
    ],
  },
  "nurture-campaigns": {
    intro:
      "Nurture Campaigns runs multi-step follow-up sequences (SMS/email and more) with delays, templates, and audience targeting via tags.",
    sections: [
      {
        title: "Campaign lifecycle + what you can edit",
        body: "Campaigns move through DRAFT / ACTIVE / PAUSED / ARCHIVED. While in draft you build steps and audience; active campaigns enroll contacts that match the audience rules.",
        steps: [
          "Audience: one or more contact tags define who enrolls.",
          "Steps: each step has a channel and a delay from the previous step.",
          "Templates: apply a template to quickly create a full sequence.",
          "Variables: use Insert variable for personalization.",
        ],
      },
      {
        title: "Create a campaign (end-to-end)",
        body: "Start with one short sequence. You can always add steps later.",
        steps: [
          "Open Services → Nurture Campaigns.",
          "Click Create campaign.",
          "Name the campaign and leave it in DRAFT while you build.",
          "Select audience tags (or create a new tag).",
          "Add steps: choose channel, write copy, and set delay timing.",
          "Save and run a small test by tagging a test contact.",
          "When ready, set the campaign to ACTIVE.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If people are dropping out or not engaging:",
        steps: [
          "Shorten very long sequences so the main value is clear sooner.",
          "Make sure each message has one job: educate, remind, or ask for a small next step.",
          "Confirm the campaign is ACTIVE and that contacts actually have the audience tags.",
          "If messages are not sending, confirm SMS/email channels are configured and the contact has valid contact info.",
        ],
      },
    ],
  },
  reporting: {
    intro: "Reporting shows what is live and how much time you are saving.",
    sections: [
      {
        title: "How it should feel",
        body: "You can open reporting and quickly see which services are doing the most work for you.",
      },
      {
        title: "Use the date range + filters",
        body: "Reporting is designed to answer: what happened, which service caused it, and is anything broken?",
        steps: [
          "Open Services → Reporting.",
          "Use the range buttons (Today / 7d / 30d / 90d / All) to switch the reporting window.",
          "Use the Search box to find a metric by keyword (for example “credits”, “missed”, “reviews”, “bookings”).",
          "Use the Service dropdown to filter to one service (AI Receptionist, Lead Scraping, Reviews, etc.).",
          "If you only want to see services that are active/configured, keep Active only enabled.",
        ],
      },
      {
        title: "Add widgets to your dashboard",
        body: "Anything with a ⋯ menu can be pinned to Dashboard as a widget.",
        steps: [
          "On a metric card, click the ⋯ menu in the top-right corner.",
          "Click Add to dashboard (or confirm it says Already on dashboard).",
          "Go to Dashboard and click Edit to drag and resize your widgets.",
          "Use Done to save your layout (or Reset if you want to start over).",
        ],
      },
      {
        title: "Read the performance section",
        body: "Use the performance widgets to spot failures before customers feel them.",
        steps: [
          "Scroll to Automation performance (by service).",
          "If Success rate is low or Failures is high, use the ⋯ menu to jump to the related service (Go to AI Receptionist / Missed-Call Text Back / Lead Scraping / Reviews).",
          "Use Daily activity to see whether the issue is isolated to a specific day or ongoing.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If numbers do not look right:",
        steps: [
          "Confirm the underlying services are actually turned on and used. Reporting will be flat if nothing is running.",
          "Check the date range filters and compare this week to last week to make sure you are not looking at an empty window.",
          "If you have Active only enabled and you can’t find a service, turn it off temporarily to see all available widgets.",
          "If a specific service looks wrong, open that service and confirm setup/integrations (phone numbers, calendars, credits, etc.).",
        ],
      },
    ],
  },
  dashboard: {
    intro: "Dashboard is your quick read on what is happening in your account without digging through every service.",
    sections: [
      {
        title: "How it should feel",
        body: "Opening the dashboard should give you a calm, accurate snapshot: which services are active, how many hours you are saving, and whether anything needs attention.",
      },
      {
        title: "Edit and rearrange your dashboard",
        body: "You can drag, resize, and reset dashboard tiles so the information you care about most is always on top.",
        steps: [
          "From Dashboard, click the Edit button in the top right of the dashboard area.",
          "While Edit is on, use the ⋮⋮ handle on each card to drag it into a new position.",
          "Resize cards from the bottom-right corner if you want some widgets larger or smaller.",
          "Use the Remove button on a card to hide widgets you do not care about (you can always re-add them later from Reporting).",
          "Click Done to save your layout, or Reset to go back to the default layout.",
        ],
      },
      {
        title: "Using the dashboard each week",
        body: "Treat the dashboard as your check-in, not a detailed report.",
        steps: [
          "Open the dashboard at least once a week to see which services are doing the most work.",
          "Look at hours saved and activity summaries rather than every individual event.",
          "If a tile looks flat, click through to the related service tutorial to check setup.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If the dashboard does not match what you expect:",
        steps: [
          "Confirm the underlying services (Inbox, AI Receptionist, Booking, etc.) are turned on and being used.",
          "Check any date range filters and make sure you are not looking at an empty window.",
          "If a number seems frozen, open the matching service page and confirm new activity is actually happening there.",
        ],
      },
    ],
  },
  people: {
    intro:
      "People is your CRM layer: contacts, tags, custom variables, linked leads, and cross-service history (inbox threads, bookings, reviews). It also includes user management and duplicates cleanup.",
    sections: [
      {
        title: "People areas (tabs)",
        body: "People includes Contacts, Users, and Duplicates. Contacts is the main workspace; Users is for team members; Duplicates helps clean data.",
        steps: [
          "Contacts: search, view details, edit tags and custom variables, import contacts, and link unlinked leads.",
          "Users: review who has access and their role/status.",
          "Duplicates: review duplicate groups (often grouped by phone) and clean up data quality issues.",
        ],
      },
      {
        title: "Search and review a contact (daily workflow)",
        body: "Use People → Contacts as the source of truth when you need to understand a person across services.",
        steps: [
          "Open People → Contacts.",
          "Search by name, email, or phone.",
          "Open a contact to view details: tags, custom variables, linked leads, inbox threads, bookings, and reviews.",
          "Update tags to reflect stage/intent (these tags drive automations and campaign audiences).",
          "Edit custom variables to improve personalization in templates and automations.",
        ],
      },
      {
        title: "Add contacts (manual and CSV import)",
        body: "You can add contacts one-by-one or in bulk. Import supports mapping columns and handling duplicates.",
        steps: [
          "In Contacts, click Add contacts.",
          "Choose Manual to add a single contact: name, email, phone, and tags.",
          "Use Create tag if you need a new tag during entry.",
          "Choose CSV to upload a file and map columns (name/first/last/email/phone/tags).",
          "Review the import preview, then import.",
          "If duplicates are detected, review the result and choose whether to add duplicates anyway.",
        ],
      },
      {
        title: "Unlinked leads (link leads to contacts)",
        body: "If you have leads that exist but are not linked to a contact, link them so history and automations have a single record.",
        steps: [
          "In Contacts, scroll to the Unlinked leads section.",
          "Open a lead and link it to the correct contact (or create a new contact if needed).",
          "After linking, confirm the lead appears in the contact detail under Leads.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If a person or detail is missing:",
        steps: [
          "Expected contact missing: confirm they were imported or interacted with a service that creates contacts.",
          "Duplicates: use People → Duplicates to identify duplicate groups.",
          "Tags look wrong: check automations and imports that assign tags so you fix the source, not just the symptom.",
          "Variables missing in templates: ensure the custom variable key/value exists on the contact and the key matches what the variable picker expects.",
        ],
      },
    ],
  },
  billing: {
    intro: "Billing keeps your plan, invoices, and credit balance in one place for this portal account.",
    sections: [
      {
        title: "How it should feel",
        body: "You can open Billing and immediately understand what you are paying for, when the next charge is, and how many credits you have.",
      },
      {
        title: "Review charges and plan",
        body: "Use Billing when you want to confirm money details or see what is currently active.",
        steps: [
          "Open Billing from the left sidebar.",
          "Review the current plan and any add-ons or usage-based items like credits.",
          "Check recent invoices or receipts when you need to reconcile with your accounting system.",
        ],
      },
      {
        title: "Change or cancel your subscription",
        body: "Use the built-in billing portal to update payment details or cancel the main subscription.",
        steps: [
          "From Billing, click Manage billing at the top. This opens the secure Stripe billing portal in a new tab.",
          "Inside the billing portal, update your card or payment method as needed.",
          "When you want to cancel the main subscription, use the Cancel or Cancel plan option in the Stripe portal and confirm.",
          "Come back to Billing in the portal to confirm the subscription status updates to Canceling or Not active.",
        ],
      },
      {
        title: "Add or remove individual services",
        body: "Use the Add services and Services & status sections to turn specific services on or off without canceling everything.",
        steps: [
          "Scroll down to the Add services section in Billing to see add-ons you can enable (Blogs, Booking, Automation Builder, etc.).",
          "Click Enable on a service you want. You will go through a quick checkout, then the service unlocks automatically.",
          "In the Services & status section, use the ⋯ menu next to a service to Pause or Cancel service when you no longer want it running.",
          "If a service shows Needs setup, use the Open or Open settings action to finish configuration instead of canceling it by mistake.",
        ],
      },
      {
        title: "Buy and manage credits",
        body: "Credits for usage-based features are managed directly inside Billing.",
        steps: [
          "In the Credits panel on Billing, confirm your current balance and whether auto top-up is enabled.",
          "Turn Auto top-up on if you want the system to recharge credits automatically when you run out using your saved card.",
          "Use the preset buttons (for example 500, 1,000, 2,500) or type a custom number of credits you want to buy.",
          "Review the Total line to see how many credits and roughly how much in USD you are about to purchase, then click Buy credits to go through checkout.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If something looks off with billing or credits:",
        steps: [
          "Confirm you are viewing the correct portal account if you manage more than one.",
          "If credits look lower than expected, check recent usage in services that consume credits (for example, AI Receptionist or lead scraping).",
          "If a payment failed or a renewal did not go through, update your card details and retry from Billing, then refresh the page.",
        ],
      },
    ],
  },
  profile: {
    intro:
      "Profile is where you manage your own login details, notification targets, and integrations (like Twilio) that power phone/SMS services across the portal.",
    sections: [
      {
        title: "What belongs in Profile",
        body: "Profile is for user-scoped settings: your identity, notification info, and provider credentials used by services.",
        steps: [
          "Account: name, email, password.",
          "Notifications: where you want alerts (email/phone).",
          "Integrations: Twilio credentials and other keys used by services like AI Receptionist, Inbox SMS, and outbound calling.",
        ],
      },
      {
        title: "Keeping your profile up to date",
        body: "Use Profile whenever your own details change.",
        steps: [
          "Update your name and email when they change so notifications go to the right place.",
          "Set your phone number if you want SMS notifications or forwarding to your device.",
          "Add or update integration keys (such as Twilio or voice agent settings) when your provider credentials change.",
          "After changing provider credentials, re-test services that depend on them (AI Receptionist, Inbox SMS, AI outbound calls).",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If updates behave unexpectedly:",
        steps: [
          "If changing your email, make sure you enter your current password correctly so the system can verify you.",
          "If profile updates fail, double check that any integration keys you paste are complete and active in the provider.",
          "If notifications stop after an email change, log out and back in once so your session fully refreshes, then confirm the email on Profile matches what you expect.",
          "If phone/SMS services stop working, confirm Twilio credentials are valid and that your Twilio numbers still exist in the same Twilio project.",
        ],
      },
    ],
  },
  credits: {
    intro: "Credits are the usage-based fuel behind some services in your portal, like AI calls or lead scraping.",
    sections: [
      {
        title: "What credits are",
        body: "Think of credits as a prepaid balance that usage-based services draw from instead of charging you a separate invoice every time.",
        steps: [
          "Certain services (for example AI Receptionist minutes, outbound calls, or lead scraping pulls) consume credits when they run.",
          "Your plan may include a base amount of credits each billing period, with the option to buy more if you need them.",
        ],
      },
      {
        title: "How credits are used",
        body: "Each service has its own rules for how many credits it consumes.",
        steps: [
          "AI and phone-heavy services usually charge per call, minute, or conversation.",
          "Data-heavy services like lead scraping usually charge per record, search, or batch.",
          "You will always see the current balance in Billing, and many services show how much they used recently in their own reporting.",
        ],
      },
      {
        title: "What happens when you are low on credits",
        body: "Running out of credits should never silently break your account.",
        steps: [
          "When credits get low, you will see warnings in Billing and in the affected services where possible.",
          "If you fully run out, usage-based actions may pause or throttle instead of failing in the middle of a workflow.",
          "You can top up credits from Billing. Once the payment succeeds, new activity will resume against the updated balance.",
        ],
      },
      {
        title: "Where to check your credits",
        body: "You can always confirm your balance and recent usage.",
        steps: [
          "Open Billing from the left sidebar to see current credits and plan details.",
          "Look at the services you use most (for example AI Receptionist or lead scraping) to understand which ones are consuming the most credits.",
          "If credit usage looks unexpectedly high, walk back through recent campaigns or automation changes to see what increased volume.",
        ],
      },
      {
        title: "Buy credits step by step",
        body: "Use the Credits panel in Billing when you actually need to add more.",
        steps: [
          "Open Billing and scroll to the Credits section.",
          "Decide whether you want Auto top-up on (automatic recharges when you run out) or off (you will top up manually).",
          "Pick a preset like 500 or 1,000 credits, or type your own number in the input field.",
          "Confirm the total credits and USD amount shown, then click Buy credits to go through the secure checkout.",
        ],
      },
    ],
  },
  "getting-started": {
    intro: "Getting started walks through the core pieces of the portal so you know what to turn on first and how it all fits together.",
    sections: [
      {
        title: "What to do in your first session",
        body: "Use this as a quick checklist the first time you log in.",
        steps: [
          "Open Dashboard to see the default snapshot and make sure it loads without errors.",
          "Click Services and skim the list so you know what is available in your plan.",
          "Turn on one or two core services you care about most right now (for example AI Receptionist, Inbox, or Booking).",
          "Open Tutorials and pick one service to fully configure end-to-end today (setup → test → go live).",
        ],
      },
      {
        title: "Wire up the essentials",
        body: "Make sure the foundations are connected so automations can actually run.",
        steps: [
          "Visit Profile to confirm your email, phone, and any integrations like Twilio are set correctly.",
          "If you plan to use phone features, connect your Twilio number and set the correct webhooks from the related tutorial pages.",
          "If you rely on bookings, connect your calendar and test that you can create a test appointment.",
          "If you plan to publish public pages, set up Funnel Builder domains early because DNS changes can take time to propagate.",
        ],
      },
      {
        title: "How it should feel after setup",
        body: "Once you have the basics in place, the portal should feel calm and predictable rather than noisy.",
        steps: [
          "Dashboard shows real activity instead of empty tiles.",
          "Inbox and AI Receptionist start to collect calls and messages in one place instead of in scattered tools.",
          "You can explain in one sentence what each turned-on service is doing for you (for example, 'AI Receptionist answers after hours so we do not miss calls').",
        ],
      },
      {
        title: "Troubleshooting your first week",
        body: "If something feels off while you are still new, start here.",
        steps: [
          "If you do not see any activity, double check that at least one service is turned on and properly connected (phone, calendar, email).",
          "If you are not sure what to do next, open the Tutorials page and pick the guide that matches the service you care about most.",
          "If data looks wrong, confirm you are in the right portal account and that test events (like test calls or bookings) are actually happening.",
          "If domains or webhooks are involved, test in an incognito window to avoid cached sessions and stale DNS.",
        ],
      },
    ],
  },
};

export default async function PortalTutorialDetailPage(props: { params: Promise<{ slug: string }> }) {
  await requirePortalUser();
  const { slug } = await props.params;
  const serviceFromCatalog = PORTAL_SERVICES.find((s) => s.slug === slug && !s.hidden);
  const service: TutorialUiService | null = serviceFromCatalog
    ? {
        slug: serviceFromCatalog.slug,
        title: serviceFromCatalog.title,
        description: serviceFromCatalog.description,
        accent: serviceFromCatalog.accent,
      }
    : CORE_TUTORIAL_PAGES[slug] ?? null;

  if (!service) notFound();

  const tutorial = TUTORIALS[slug] ?? {
    intro: "This tutorial is still being written.",
    sections: [
      {
        title: "Overview",
        body: "This page will cover how to use this service in your portal.",
      },
    ],
  };

  const videoUrl = await getTutorialVideoUrl(slug);
  const photoUrls = await getTutorialPhotoUrls(slug);

  return (
    <div className="w-full bg-white">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-4 text-xs text-zinc-500">
          <Link href="/portal/tutorials" className="hover:underline">
            Help &amp; tutorials
          </Link>
          <span className="mx-1">/</span>
          <span>{service.title}</span>
        </div>

        <div className="flex items-start gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50">
            <span
              className={
                service.accent === "blue"
                  ? "text-[color:var(--color-brand-blue)]"
                  : service.accent === "coral"
                    ? "text-[color:var(--color-brand-pink)]"
                    : "text-zinc-700"
              }
            >
              <IconServiceGlyph slug={service.slug} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{service.title}</h1>
            <p className="mt-1 text-sm text-zinc-600 sm:text-base">{tutorial.intro || service.description}</p>
          </div>
        </div>

        {videoUrl ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-black/5">
            <div className="aspect-video w-full">
              <iframe
                src={videoUrl}
                title={`${service.title} tutorial video`}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        ) : null}

        {photoUrls.length ? (
          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
            <div className="text-sm font-semibold text-brand-ink">Screenshots</div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {photoUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
                >
                  <img
                    src={url}
                    alt="Tutorial screenshot"
                    className="h-auto w-full object-cover transition-transform group-hover:scale-[1.01]"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-8">
          {tutorial.sections.map((section) => (
            <section key={section.title} className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
              <h2 className="text-base font-semibold text-brand-ink sm:text-lg">{section.title}</h2>
              <p className="mt-2 text-sm text-zinc-700">{section.body}</p>
              {section.steps && section.steps.length ? (
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
