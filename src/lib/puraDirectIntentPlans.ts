import type { PortalAgentActionKey } from "@/lib/portalAgentActions";
import type { PuraDirectIntentContext, PuraDirectIntentSignals } from "@/lib/puraDirectIntentSignals";

export type PuraDirectActionPlan = {
  action: PortalAgentActionKey;
  traceTitle: string;
  args: Record<string, unknown>;
};

export function getPuraDirectPrerequisiteMessage(opts: {
  signals: PuraDirectIntentSignals;
  threadContext?: unknown;
}): string | null {
  const { signals } = opts;
  const threadContext = safeContext(opts.threadContext);

  if (signals.shouldCreateLandingPage && !threadContext.lastFunnel?.id) {
    return "I can create that landing page as soon as we have a funnel to attach it to. If you want, ask me to create the funnel first and I will continue from there.";
  }

  if (signals.shouldGenerateLandingLayout && (!threadContext.lastFunnel?.id || !threadContext.lastFunnelPage?.id)) {
    return "I can generate that layout as soon as there is a saved funnel page to design. If you want, ask me to create the page first and I will keep going from there.";
  }

  if (signals.shouldSendLatestNewsletter && !threadContext.lastNewsletter?.id) {
    return "I can send that newsletter as soon as there is a newsletter draft in this thread. If you want, I can create the draft first and then send it.";
  }

  if (signals.shouldPublishLatestBlog && !threadContext.lastBlogPost?.id) {
    return "I can publish that blog post as soon as there is a blog draft in this thread. If you want, I can create the draft first and then publish it.";
  }

  if (signals.nurtureStepIntent && !threadContext.lastNurtureCampaign?.id) {
    return "I can add that nurture step as soon as there is a nurture campaign to put it into. If you want, ask me to create the campaign first and I will continue from there.";
  }

  if (signals.shouldListLatestMediaFolder && !threadContext.lastMediaFolder?.id) {
    return "I can list that folder as soon as we have a media folder to inspect. If you want, ask me to create or pick the folder first and I will continue from there.";
  }

  return null;
}

function safeContext(raw: unknown): PuraDirectIntentContext {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as PuraDirectIntentContext) : {};
}

function makeSlug(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

type DirectLandingPageSeed = {
  slug: string;
  title: string;
  contentMarkdown: string;
};

function buildDirectLandingPageSeed(compactPrompt: string): DirectLandingPageSeed {
  const text = String(compactPrompt || "").trim().toLowerCase();

  if (/\b(webinar|workshop|masterclass|save your seat|save their seat|register)\b/.test(text)) {
    return {
      slug: "webinar-signup",
      title: "Free Webinar Registration",
      contentMarkdown: [
        "# Free Webinar Registration",
        "",
        "Reserve your seat for the live session.",
        "",
        "## Page job",
        "Register qualified attendees for the webinar without mixing in pricing or checkout posture too early.",
        "",
        "## What to clarify",
        "- what the webinar covers",
        "- who the webinar is for",
        "- what attendees leave with",
        "",
        "## CTA",
        "Invite the visitor to reserve a seat.",
      ].join("\n"),
    };
  }

  if (/\b(book|booking|schedule|strategy call|consult|consultation|demo call|discovery call)\b/.test(text)) {
    return {
      slug: "book-call",
      title: "Book a Strategy Call",
      contentMarkdown: [
        "# Book a Strategy Call",
        "",
        "Choose a time for the conversation.",
        "",
        "## Page job",
        "Move qualified visitors into a clear booking handoff with a concrete next step.",
        "",
        "## What to clarify",
        "- who the call is for",
        "- what the call helps resolve",
        "- what happens after booking",
      ].join("\n"),
    };
  }

  if (/\b(download|guide|checklist|template|lead magnet|resource)\b/.test(text)) {
    return {
      slug: "download",
      title: "Get the Resource",
      contentMarkdown: [
        "# Get the Resource",
        "",
        "Download the guide and get the next step by email.",
        "",
        "## Page job",
        "Trade a focused resource for a lead capture handoff without drifting into a sales page.",
        "",
        "## What to clarify",
        "- what the resource helps with",
        "- who it is for",
        "- what the reader gets next",
      ].join("\n"),
    };
  }

  return {
    slug: "landing-page",
    title: "Landing Page",
    contentMarkdown: [
      "# Landing Page",
      "",
      "Clarify the page job, the core promise, and the next step.",
      "",
      "## Page job",
      "State the primary conversion outcome before adding supporting sections.",
    ].join("\n"),
  };
}

export function getPuraDirectActionPlan(opts: {
  prompt: string;
  signals: PuraDirectIntentSignals;
  threadContext?: unknown;
}): PuraDirectActionPlan | null {
  const { prompt, signals } = opts;
  const threadContext = safeContext(opts.threadContext);

  if (signals.nurtureCampaignCreateTitle && signals.compactPrompt.includes("nurture")) {
    return {
      action: "nurture.campaigns.create",
      traceTitle: "Create Nurture Campaign",
      args: { name: signals.nurtureCampaignCreateTitle.slice(0, 120) },
    };
  }

  if (signals.newsletterCreateTitle) {
    const title = signals.newsletterCreateTitle;
    return {
      action: "newsletter.newsletters.create",
      traceTitle: "Create Newsletter",
      args: {
        kind: "external",
        status: "DRAFT",
        title,
        excerpt: `A compelling update for ${title}.`,
        content: `# ${title}\n\nThis draft is set up for a webinar-focused audience and is ready for refinement and sending.`,
      },
    };
  }

  if (signals.shouldSendLatestNewsletter && threadContext.lastNewsletter?.id) {
    return {
      action: "newsletter.newsletters.send",
      traceTitle: "Send Newsletter",
      args: { newsletterId: String(threadContext.lastNewsletter.id).trim() },
    };
  }

  if (signals.blogCreateTitle) {
    return {
      action: "blogs.posts.create",
      traceTitle: "Create Blog Draft",
      args: { title: signals.blogCreateTitle },
    };
  }

  if (signals.shouldPublishLatestBlog && threadContext.lastBlogPost?.id) {
    return {
      action: "blogs.posts.publish",
      traceTitle: "Publish Blog Post",
      args: { postId: String(threadContext.lastBlogPost.id).trim() },
    };
  }

  if (signals.funnelCreateTitle) {
    const name = signals.funnelCreateTitle.slice(0, 120);
    return {
      action: "funnel.create",
      traceTitle: "Create Funnel",
      args: { name, slug: makeSlug(name) || "webinar-growth-funnel" },
    };
  }

  if (signals.shouldCreateLandingPage && threadContext.lastFunnel?.id) {
    const seed = buildDirectLandingPageSeed(signals.compactPrompt);
    return {
      action: "funnel_builder.pages.create",
      traceTitle: "Create Funnel Landing Page",
      args: {
        funnelId: String(threadContext.lastFunnel.id).trim(),
        slug: seed.slug,
        title: seed.title,
        contentMarkdown: seed.contentMarkdown,
      },
    };
  }

  if (signals.shouldGenerateLandingLayout && threadContext.lastFunnel?.id && threadContext.lastFunnelPage?.id) {
    return {
      action: "funnel_builder.pages.generate_html",
      traceTitle: "Generate Funnel Page Layout",
      args: {
        funnelId: String(threadContext.lastFunnel.id).trim(),
        pageId: String(threadContext.lastFunnelPage.id).trim(),
        prompt,
      },
    };
  }

  if (signals.shouldUpdateCurrentFunnelPage && threadContext.lastFunnel?.id && threadContext.lastFunnelPage?.id) {
    return {
      action: "funnel_builder.pages.generate_html",
      traceTitle: "Update Funnel Page",
      args: {
        funnelId: String(threadContext.lastFunnel.id).trim(),
        pageId: String(threadContext.lastFunnelPage.id).trim(),
        prompt,
      },
    };
  }

  if (signals.mediaFolderCreateTitle) {
    return {
      action: "media.folder.ensure",
      traceTitle: "Ensure Media Folder Exists",
      args: { name: signals.mediaFolderCreateTitle.slice(0, 120) },
    };
  }

  if (signals.shouldImportToNamedMediaFolder && signals.mediaImportUrl) {
    return {
      action: "media.import_remote_image",
      traceTitle: "Import Remote Image",
      args: {
        url: signals.mediaImportUrl,
        ...(signals.mediaImportFolderNameHint
          ? { folderName: signals.mediaImportFolderNameHint }
          : threadContext.lastMediaFolder?.id
            ? { folderId: String(threadContext.lastMediaFolder.id).trim() }
            : {}),
      },
    };
  }

  if (signals.shouldListLatestMediaFolder && threadContext.lastMediaFolder?.id) {
    return {
      action: "media.items.list",
      traceTitle: "List Media Items",
      args: { folderId: String(threadContext.lastMediaFolder.id).trim(), limit: 50 },
    };
  }

  if (signals.shouldListReviewsWithoutReply) {
    return {
      action: "reviews.inbox.list",
      traceTitle: "List Reviews Without Business Reply",
      args: { hasBusinessReply: false },
    };
  }

  if (signals.shouldRunPreflightReviewSummary) {
    return {
      action: "reviews.inbox.list",
      traceTitle: "Summarize Reviews",
      args: {},
    };
  }

  if (signals.nurtureStepIntent) {
    return {
      action: "nurture.campaigns.steps.add",
      traceTitle: signals.nurtureStepIntent.kind === "SMS" ? "Add SMS Step to Nurture Campaign" : "Add Email Step to Nurture Campaign",
      args: signals.nurtureStepIntent,
    };
  }

  if (signals.leadRunIntent && (signals.leadRunIntent.count || signals.leadRunIntent.niche || signals.leadRunIntent.location)) {
    return {
      action: "lead_scraping.run",
      traceTitle: "Run Lead Scraping",
      args: signals.leadRunIntent,
    };
  }

  if (signals.shouldListLatestLeads) {
    return {
      action: "lead_scraping.leads.list",
      traceTitle: "List Scraped Leads",
      args: { take: 10 },
    };
  }

  if (signals.shouldDraftLeadEmail) {
    return {
      action: "lead_scraping.outbound.ai.draft_template",
      traceTitle: "Draft Outbound Email Template",
      args: { kind: "EMAIL", prompt },
    };
  }

  if (signals.shouldSuggestBookingSlots) {
    return {
      action: "booking.suggestions.slots",
      traceTitle: "Get Booking Slot Suggestions",
      args: { days: 7, limit: 10 },
    };
  }

  if (signals.shouldUpdateBookingThankYou) {
    return {
      action: "booking.form.update",
      traceTitle: "Update Booking Form",
      args: { thankYouMessage: "We will send a prep checklist before the call." },
    };
  }

  return null;
}
