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
    return "I cannot create that landing page yet because there is not a successfully created funnel in this thread to attach it to.";
  }

  if (signals.shouldGenerateLandingLayout && (!threadContext.lastFunnel?.id || !threadContext.lastFunnelPage?.id)) {
    return "I cannot generate that page layout yet because there is not a saved funnel page in this thread to design.";
  }

  if (signals.shouldSendLatestNewsletter && !threadContext.lastNewsletter?.id) {
    return "I cannot send that newsletter yet because there is not a successfully created newsletter in this thread.";
  }

  if (signals.shouldPublishLatestBlog && !threadContext.lastBlogPost?.id) {
    return "I cannot publish that blog post yet because there is not a successfully created blog draft in this thread.";
  }

  if (signals.nurtureStepIntent && !threadContext.lastNurtureCampaign?.id) {
    return "I cannot add that nurture step yet because there is not a successfully created nurture campaign in this thread.";
  }

  if (signals.shouldListLatestMediaFolder && !threadContext.lastMediaFolder?.id) {
    return "I cannot list that folder yet because there is not a media folder from this thread to inspect.";
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

export function getPuraDirectActionPlan(opts: {
  prompt: string;
  signals: PuraDirectIntentSignals;
  threadContext?: unknown;
}): PuraDirectActionPlan | null {
  const { prompt, signals } = opts;
  const threadContext = safeContext(opts.threadContext);

  if (signals.hostedPageUpdateTarget) {
    return {
      action: "hosted_pages.documents.update",
      traceTitle: "Update Hosted Page Document",
      args: {
        service: signals.hostedPageUpdateTarget.service,
        ...(signals.hostedPageUpdateTarget.pageKey ? { pageKey: signals.hostedPageUpdateTarget.pageKey } : null),
        ...(signals.hostedPageUpdateTarget.title ? { title: signals.hostedPageUpdateTarget.title } : null),
        ...(signals.hostedPageUpdateTarget.status ? { status: signals.hostedPageUpdateTarget.status } : null),
      },
    };
  }

  if (signals.hostedPagePublishTarget) {
    return {
      action: "hosted_pages.documents.publish",
      traceTitle: "Publish Hosted Page Document",
      args: {
        service: signals.hostedPagePublishTarget.service,
        ...(signals.hostedPagePublishTarget.pageKey ? { pageKey: signals.hostedPagePublishTarget.pageKey } : null),
      },
    };
  }

  if (signals.hostedPageResetTarget) {
    return {
      action: "hosted_pages.documents.reset_to_default",
      traceTitle: "Reset Hosted Page Document",
      args: {
        service: signals.hostedPageResetTarget.service,
        ...(signals.hostedPageResetTarget.pageKey ? { pageKey: signals.hostedPageResetTarget.pageKey } : null),
      },
    };
  }

  if (signals.hostedPageGenerateTarget) {
    return {
      action: "hosted_pages.documents.generate_html",
      traceTitle: "Generate Hosted Page HTML",
      args: {
        service: signals.hostedPageGenerateTarget.service,
        ...(signals.hostedPageGenerateTarget.pageKey ? { pageKey: signals.hostedPageGenerateTarget.pageKey } : null),
        prompt,
      },
    };
  }

  if (signals.hostedPagePreviewTarget) {
    return {
      action: "hosted_pages.documents.preview_data",
      traceTitle: "Inspect Hosted Page Preview Data",
      args: {
        service: signals.hostedPagePreviewTarget.service,
        ...(signals.hostedPagePreviewTarget.pageKey ? { pageKey: signals.hostedPagePreviewTarget.pageKey } : null),
      },
    };
  }

  if (signals.hostedPageGetTarget) {
    return {
      action: signals.hostedPageGetTarget.pageKey ? "hosted_pages.documents.get" : "hosted_pages.documents.list",
      traceTitle: signals.hostedPageGetTarget.pageKey ? "Get Hosted Page Document" : "List Hosted Page Documents",
      args: signals.hostedPageGetTarget.pageKey
        ? {
            service: signals.hostedPageGetTarget.service,
            pageKey: signals.hostedPageGetTarget.pageKey,
          }
        : { service: signals.hostedPageGetTarget.service },
    };
  }

  if (signals.hostedPageListService) {
    return {
      action: "hosted_pages.documents.list",
      traceTitle: "List Hosted Page Documents",
      args: { service: signals.hostedPageListService },
    };
  }

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
    return {
      action: "funnel_builder.pages.create",
      traceTitle: "Create Funnel Landing Page",
      args: {
        funnelId: String(threadContext.lastFunnel.id).trim(),
        slug: "webinar-signup",
        title: "Free Webinar Signup",
        contentMarkdown: "# Free Webinar Signup\n\nReserve your spot for the webinar.",
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
