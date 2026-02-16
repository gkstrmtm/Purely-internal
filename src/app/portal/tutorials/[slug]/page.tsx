import Link from "next/link";
import { notFound } from "next/navigation";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { IconServiceGlyph } from "@/app/portal/PortalIcons";
import { requirePortalUser } from "@/lib/portalAuth";

type TutorialSection = {
  title: string;
  body: string;
  steps?: string[];
};

type TutorialConfig = {
  intro?: string;
  sections: TutorialSection[];
};

const TUTORIALS: Record<string, TutorialConfig> = {
  inbox: {
    intro: "Use Inbox / Outbox to keep email and SMS threads in one place so your team does not have to jump between tools.",
    sections: [
      {
        title: "Overview",
        body: "Inbox / Outbox pulls conversations into a single view. You can see who messaged, reply from the portal, and keep context around each contact.",
      },
      {
        title: "Daily workflow",
        body: "Most teams live on the main inbox list.",
        steps: [
          "Open Inbox / Outbox from Services in the left sidebar.",
          "Filter by unread, assigned, or channel if you need to narrow things down.",
          "Click a thread to see the full history and reply by email or SMS.",
          "Add quick notes so other teammates know what happened.",
        ],
      },
      {
        title: "Tips",
        body: "Keep all communication inside threads so you can see who said what and when, instead of hunting through multiple inboxes.",
      },
    ],
  },
  "media-library": {
    intro: "Store photos, videos, and files once, then reuse them across campaigns, automations, and messages.",
    sections: [
      {
        title: "Upload and organize",
        body: "Create folders that match how your team works, then drag files in.",
        steps: [
          "Open Media Library from Services.",
          "Use folders for categories like testimonials, before/after, or promotions.",
          "Upload files from your computer or phone.",
        ],
      },
      {
        title: "Reuse media",
        body: "Anywhere you can attach a file or image in the portal, you can pull from the Media Library instead of uploading again.",
      },
    ],
  },
  tasks: {
    intro: "Tasks keep internal to‑dos tied to the work your automations and services are doing.",
    sections: [
      {
        title: "Create tasks",
        body: "Use tasks for follow‑ups that need a human touch.",
        steps: [
          "Open Tasks from Services.",
          "Click to add a new task, give it a clear title, and assign it.",
          "Set a due date when timing matters.",
        ],
      },
      {
        title: "Work the list",
        body: "Sort by due date or status, then close tasks as they are finished so reporting stays clean.",
      },
    ],
  },
  "ai-receptionist": {
    intro: "AI Receptionist answers and routes inbound calls so you only handle the calls that need a human.",
    sections: [
      {
        title: "Set up the receptionist",
        body: "Start by turning the service on and pointing your number at the portal.",
        steps: [
          "Open AI Receptionist in your portal services.",
          "Turn it on and write a greeting that sounds like your business.",
          "Choose whether calls go to AI only or can be transferred to a human.",
          "If you forward to a person, add the transfer number in E.164 format (for example, +15551234567).",
        ],
      },
      {
        title: "Connect Twilio",
        body: "Twilio connects your phone number to the AI receptionist.",
        steps: [
          "In your Profile, add your Twilio credentials.",
          "Copy the Voice webhook URL from the AI Receptionist settings.",
          "Paste that URL into your Twilio number's Voice webhook settings.",
        ],
      },
      {
        title: "Review calls",
        body: "Use the activity view to see what the AI handled.",
        steps: [
          "Open the AI Receptionist activity tab.",
          "Click a call to see the transcript, notes, and recording.",
          "Use the notes as a quick summary and the transcript when you need full detail.",
        ],
      },
    ],
  },
  newsletter: {
    intro: "Newsletter lets you send simple campaigns to your existing contacts without switching tools.",
    sections: [
      {
        title: "Create a campaign",
        body: "Draft an email that explains one idea clearly.",
        steps: [
          "Open Newsletter from Services.",
          "Create a new campaign and pick the audience list.",
          "Write a subject line that sounds like you, not a template.",
          "Add the main content and a clear call to action.",
        ],
      },
      {
        title: "Send and review",
        body: "After you send, use basic stats to see what worked.",
      },
    ],
  },
  booking: {
    intro: "Booking Automation reduces back‑and‑forth so more people end up on your calendar.",
    sections: [
      {
        title: "Connect your calendar",
        body: "Connect the calendar you actually use so the portal can see your real availability.",
      },
      {
        title: "Share your booking link",
        body: "Use one booking link anywhere you currently ask people to call or text.",
        steps: [
          "Open Booking Automation from Services.",
          "Copy your public booking link.",
          "Add it to your website, email signature, and follow‑up messages.",
        ],
      },
    ],
  },
  "ai-outbound-calls": {
    intro: "AI Outbound Calls automatically place calls based on tags or lists so you do not have to dial one by one.",
    sections: [
      {
        title: "Choose your targets",
        body: "Decide which contacts should receive outbound calls and what the script should cover.",
      },
    ],
  },
  "lead-scraping": {
    intro: "Lead Scraping pulls fresh leads on a schedule so you always have new people to talk to.",
    sections: [
      {
        title: "Run a search",
        body: "Set filters once, then reuse them.",
        steps: [
          "Open Lead Scraping from Services.",
          "Pick the niche and geography you care about.",
          "Exclude any lists you already have so you do not pay for duplicates.",
        ],
      },
    ],
  },
  automations: {
    intro: "Automation Builder lets you connect triggers and steps so the portal can handle repetitive work.",
    sections: [
      {
        title: "Start a simple flow",
        body: "Always start with one clear trigger and one outcome.",
        steps: [
          "Open Automation Builder from Services.",
          "Create a new automation and choose a trigger (for example, new lead, booked appointment, or missed call).",
          "Add one or two steps such as send SMS, send email, or create a task.",
        ],
      },
    ],
  },
  blogs: {
    intro: "Automated Blogs keep content going out without a weekly scramble.",
    sections: [
      {
        title: "Set topics",
        body: "Tell the system what topics you want to write about and how often you want posts to go out.",
      },
    ],
  },
  reviews: {
    intro: "Review Requests help you ask at the right time and track responses.",
    sections: [
      {
        title: "Send requests",
        body: "Trigger requests after completed jobs so customers can review while the experience is fresh.",
      },
    ],
  },
  "nurture-campaigns": {
    intro: "Nurture Campaigns keep leads warm with simple, spaced‑out touch points.",
    sections: [
      {
        title: "Build a sequence",
        body: "Map out a short sequence of messages that make sense for your buyers.",
      },
    ],
  },
  reporting: {
    intro: "Reporting shows what is live and how much time you are saving.",
    sections: [
      {
        title: "Check your snapshot",
        body: "Use the hours‑saved and activity summaries to see what is doing the most work for you.",
      },
    ],
  },
};

export default async function PortalTutorialDetailPage(props: { params: Promise<{ slug: string }> }) {
  await requirePortalUser();
  const { slug } = await props.params;

  const service = PORTAL_SERVICES.find((s) => s.slug === slug && !s.hidden);
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
