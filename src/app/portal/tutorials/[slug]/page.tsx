import Link from "next/link";
import { notFound } from "next/navigation";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { IconServiceGlyph } from "@/app/portal/PortalIcons";
import { requirePortalUser } from "@/lib/portalAuth";
import { getTutorialVideoUrl } from "@/lib/portalTutorialVideos";

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
  inbox: {
    intro: "Inbox / Outbox keeps email and SMS threads in one place so your team does not have to jump between tools.",
    sections: [
      {
        title: "How it should feel",
        body: "You open Inbox / Outbox and immediately see who needs a reply. Threads include the full history so anyone on your team can jump in without asking for context.",
      },
      {
        title: "Daily workflow",
        body: "Most teams live on the main inbox list.",
        steps: [
          "Open Inbox / Outbox from Services in the left sidebar.",
          "Filter by unread, assigned, or channel if you need to narrow things down.",
          "Click a thread to see the full history and reply by email or SMS.",
          "Add quick notes so other teammates know what happened and what is next.",
        ],
      },
      {
        title: "Common questions",
        body: "A few things people usually ask the first week.",
        steps: [
          "Messages from the same person are grouped by address or phone. If you see multiple threads for one contact, make sure their details match in your CRM.",
          "Replies you send from the portal show as normal emails or texts to the contact. They do not have to log in anywhere.",
          "If you do not see a recent email, check that the connected inbox for this account is the one that received it.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When something feels off, walk through these checks.",
        steps: [
          "If new emails are not showing, refresh the page first. If they still do not appear, confirm the email account for this portal account is connected correctly in your profile or integrations.",
          "If SMS replies are missing, confirm your Twilio number is connected and that the correct inbound webhook URL is set inside Twilio.",
          "If a teammate cannot see a thread, confirm they have access to the same portal account, not a different workspace.",
        ],
      },
    ],
  },
  "media-library": {
    intro: "Store photos, videos, and files once, then reuse them across campaigns, automations, and messages.",
    sections: [
      {
        title: "How it should feel",
        body: "You should never have to ask someone to resend the same file. Anything used more than once lives in the Media Library.",
      },
      {
        title: "Upload and organize",
        body: "Create folders that match how your team works, then drag files in.",
        steps: [
          "Open Media Library from Services.",
          "Create folders for categories like testimonials, before and after photos, offers, or promotion graphics.",
          "Upload files from your computer or phone. Use short, clear names so they are easy to search.",
        ],
      },
      {
        title: "Using media in other tools",
        body: "Anywhere you can attach a file or image in the portal, you can pull from the Media Library instead of uploading again.",
        steps: [
          "When composing an email, SMS, or campaign, look for the option to attach from the Media Library.",
          "Pick the file once. The system handles the hosting and links for you.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If something does not show up when you expect it:",
        steps: [
          "If a file will not upload, check that it is under the size limit and use a standard format like JPG, PNG, MP4, or PDF.",
          "If you cannot find a file, try searching by part of the file name. If that fails, confirm it was uploaded into this portal account and not another workspace.",
          "If attached media does not render inside an email or SMS preview, send a test to yourself to confirm how it appears to contacts.",
        ],
      },
    ],
  },
  tasks: {
    intro: "Tasks keep internal to dos tied to the work your automations and services are doing.",
    sections: [
      {
        title: "How it should feel",
        body: "You should be able to open Tasks and see a clean list of what needs a human touch today, without digging through notes or inboxes.",
      },
      {
        title: "Create and assign tasks",
        body: "Use tasks for follow ups that need a person to decide or do something.",
        steps: [
          "Open Tasks from Services.",
          "Click to add a new task, give it a clear title, and describe the outcome you want.",
          "Assign it to the right teammate and set a due date when timing matters.",
        ],
      },
      {
        title: "Working the list",
        body: "Keep the list honest so reporting stays useful.",
        steps: [
          "Sort by due date or status at the start of the day.",
          "Close tasks as soon as they are finished so the next person does not double work it.",
          "If a task is blocked, update the description with what is missing instead of leaving it untouched.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When tasks do not look right:",
        steps: [
          "If automations are supposed to create tasks but you see none, open Automation Builder and confirm the step that creates tasks is enabled and saved.",
          "If a teammate cannot see tasks, check that they are invited to the same portal account and have the correct permissions.",
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
          "If there is no transcript yet, wait a minute. If it still does not appear, click Refresh in the activity view. If nothing changes, confirm that Twilio and your voice agent API key are configured in Profile.",
          "If SMS or email notifications are missing, open Profile and the AI Receptionist settings to confirm your contact phone and forwarding number are set correctly.",
        ],
      },
    ],
  },
  newsletter: {
    intro: "Newsletter lets you send simple campaigns to your existing contacts without switching tools.",
    sections: [
      {
        title: "How it should feel",
        body: "You should be able to draft one clear email, pick who it goes to, and send without exporting lists or importing CSVs.",
      },
      {
        title: "Create a campaign",
        body: "Draft an email that explains one idea clearly.",
        steps: [
          "Open Newsletter from Services.",
          "Create a new campaign and pick the audience list or segment.",
          "Write a subject line that sounds like you, not a template.",
          "Add the main content and a clear call to action.",
        ],
      },
      {
        title: "Send and review",
        body: "After you send, use basic stats to see what worked.",
        steps: [
          "Schedule or send immediately when you are ready.",
          "After sends go out, review opens and clicks to see which topics land best.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When messages do not appear how you expect:",
        steps: [
          "If a campaign will not send, confirm your sending domain or email is verified in your account settings.",
          "If contacts say they did not receive it, check that they are actually on the list or segment you picked and that they are not unsubscribed.",
          "Always send a test email to yourself before a big send so you can see how it looks in a real inbox.",
        ],
      },
    ],
  },
  booking: {
    intro: "Booking Automation reduces back and forth so more people end up on your calendar.",
    sections: [
      {
        title: "How it should feel",
        body: "Leads click one link, pick a time, and get confirmation without long text or email chains.",
      },
      {
        title: "Connect your calendar",
        body: "Connect the calendar you actually use so the portal can see your real availability.",
        steps: [
          "Open Booking Automation from Services.",
          "Connect the calendar provider you use every day.",
          "Confirm your time zone and default availability windows.",
        ],
      },
      {
        title: "Share your booking link",
        body: "Use one booking link anywhere you currently ask people to call or text.",
        steps: [
          "Copy your public booking link from the Booking Automation page.",
          "Add it to your website, email signature, SMS follow ups, and ads.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If bookings do not look right:",
        steps: [
          "If times show as available when you are already busy, confirm the correct calendar is connected and that busy events are visible to the portal.",
          "If no times show at all, check your availability window settings and time zone.",
          "If confirmations are not going out, check that email and SMS notifications are enabled in booking settings.",
        ],
      },
    ],
  },
  "ai-outbound-calls": {
    intro: "AI Outbound Calls automatically place calls based on tags or lists so you do not have to dial one by one.",
    sections: [
      {
        title: "How it should feel",
        body: "You define who should be called and what the goal is. The system works that list for you, and you check the results instead of dialing.",
      },
      {
        title: "Choose your targets",
        body: "Decide which contacts should receive outbound calls and what the script should cover.",
        steps: [
          "Open AI Outbound Calls from Services.",
          "Pick the tags, list, or segment that defines who you want to call.",
          "Write a script that clearly states who you are, why you are calling, and what the next step should be if they are interested.",
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
    intro: "Lead Scraping pulls fresh leads on a schedule so you always have new people to talk to.",
    sections: [
      {
        title: "How it should feel",
        body: "You set the search once, then new leads quietly show up on the schedule you choose.",
      },
      {
        title: "Run a search",
        body: "Set filters once, then reuse them.",
        steps: [
          "Open Lead Scraping from Services.",
          "Pick the niche and geography you care about.",
          "Exclude any lists you already have so you do not pay for duplicates.",
          "Choose how many leads you want in each run.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "When results do not match what you had in mind:",
        steps: [
          "If you see too many past leads, double check your exclusion lists and make sure they include your existing customers.",
          "If there are very few results, broaden your niche keywords or radius and try again.",
          "If a scheduled job did not run, confirm the schedule is turned on and that there were enough credits available for that pull.",
        ],
      },
    ],
  },
  automations: {
    intro: "Automation Builder lets you connect triggers and steps so the portal can handle repetitive work.",
    sections: [
      {
        title: "How it should feel",
        body: "You set simple if this, then that style rules. After that, the system quietly runs them every time without you thinking about it.",
      },
      {
        title: "Start a simple flow",
        body: "Always start with one clear trigger and one outcome.",
        steps: [
          "Open Automation Builder from Services.",
          "Create a new automation and choose a single trigger, for example new lead, booked appointment, or missed call.",
          "Add one or two steps such as send SMS, send email, or create a task.",
          "Turn the automation on and save.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If automations do not fire:",
        steps: [
          "Confirm the automation is turned on. Draft or paused automations will not run.",
          "Trigger a small test event that clearly matches the trigger conditions (for example, create a test contact with the right tag).",
          "Check logs or recent activity on the related service (Tasks, Inbox, AI Receptionist) to see whether any steps ran.",
        ],
      },
    ],
  },
  blogs: {
    intro: "Automated Blogs keep content going out without a weekly scramble.",
    sections: [
      {
        title: "How it should feel",
        body: "You approve topics and guardrails once, then new posts keep showing up on a schedule.",
      },
      {
        title: "Set topics",
        body: "Tell the system what topics you want to write about and how often you want posts to go out.",
      },
      {
        title: "Troubleshooting",
        body: "If you are not seeing drafts:",
        steps: [
          "Confirm the blog service is turned on in your Services page.",
          "Check that you have enough credits for the period when posts should be generated.",
        ],
      },
    ],
  },
  reviews: {
    intro: "Review Requests help you ask at the right time and track responses.",
    sections: [
      {
        title: "How it should feel",
        body: "Requests go out right after good work is delivered, and you can see who responded and where.",
      },
      {
        title: "Set up Review Requests (Requests / Settings tab)",
        body: "Configure the automation, timing, message template, and (optional) public reviews page.",
        steps: [
          "Open Services → Review Requests.",
          "Click the Requests / Settings tab.",
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
          "In Review Requests, click the Reviews tab.",
          "If you see the message that manual sends are off, go back to Requests / Settings and enable Allow manual sends.",
          "Use the search box to find a recent booking by name, email, phone, or booking ID.",
          "Pick the correct booking, confirm the calendar is allowed (if you enabled calendar filtering), then send the request.",
          "Watch for the status/result message at the top of the page so you know it was queued/sent.",
        ],
      },
      {
        title: "Host a public reviews page (optional)",
        body: "Turn on a public page to collect reviews and optionally show a photo gallery.",
        steps: [
          "In Requests / Settings, open Hosted reviews page.",
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
    intro: "Nurture Campaigns keep leads warm with simple, spaced out touch points.",
    sections: [
      {
        title: "How it should feel",
        body: "Leads who are not ready yet still hear from you on a calm, regular schedule.",
      },
      {
        title: "Build a sequence",
        body: "Map out a short sequence of messages that make sense for your buyers.",
      },
      {
        title: "Troubleshooting",
        body: "If people are dropping out or not engaging:",
        steps: [
          "Shorten very long sequences so the main value is clear sooner.",
          "Make sure each message has one job: educate, remind, or ask for a small next step.",
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
          "Use the Service dropdown to filter to one service (AI Receptionist, Lead Scraping, Review Requests, etc.).",
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
          "If Success rate is low or Failures is high, use the ⋯ menu to jump to the related service (Go to AI Receptionist / Missed-Call Text Back / Lead Scraping / Review Requests).",
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
    intro: "People is the list of contacts your portal knows about so you can see context in one place.",
    sections: [
      {
        title: "How it should feel",
        body: "You can quickly search for someone and see the basics: who they are, how to reach them, and any key tags.",
      },
      {
        title: "Daily workflow",
        body: "Use People when you need a clean list or you are looking someone up.",
        steps: [
          "Open People from the left sidebar when you want a list view instead of an individual thread.",
          "Search by name, email, or phone when you need to pull up a contact.",
          "Use tags (when available) to group contacts by stage, interest, or segment.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If a person or detail is missing:",
        steps: [
          "If you expected someone to be in People, check whether they have interacted with your portal yet (email, SMS, booking, or lead import).",
          "If a contact appears twice, confirm that their email and phone match; merge or clean up duplicates where needed.",
          "If tags do not look right, review how automations or imports are assigning them before editing by hand.",
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
    intro: "Profile is where you manage your own login details, contact info, and key integrations tied to your user account.",
    sections: [
      {
        title: "How it should feel",
        body: "You can update your email, password, and notification details confidently without breaking access to the portal.",
      },
      {
        title: "Keeping your profile up to date",
        body: "Use Profile whenever your own details change.",
        steps: [
          "Update your name and email when they change so notifications go to the right place.",
          "Set your phone number if you want SMS notifications or forwarding to your device.",
          "Add or update integration keys (such as Twilio or voice agent settings) when your provider credentials change.",
        ],
      },
      {
        title: "Troubleshooting",
        body: "If updates behave unexpectedly:",
        steps: [
          "If changing your email, make sure you enter your current password correctly so the system can verify you.",
          "If profile updates fail, double check that any integration keys you paste are complete and active in the provider.",
          "If notifications stop after an email change, log out and back in once so your session fully refreshes, then confirm the email on Profile matches what you expect.",
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
        ],
      },
      {
        title: "Wire up the essentials",
        body: "Make sure the foundations are connected so automations can actually run.",
        steps: [
          "Visit Profile to confirm your email, phone, and any integrations like Twilio are set correctly.",
          "If you plan to use phone features, connect your Twilio number and set the correct webhooks from the related tutorial pages.",
          "If you rely on bookings, connect your calendar and test that you can create a test appointment.",
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
