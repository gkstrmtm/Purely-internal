export type PuraDirectIntentContext = {
  lastNewsletter?: { id?: string | null; label?: string | null } | null;
  lastBlogPost?: { id?: string | null; label?: string | null } | null;
  lastFunnel?: { id?: string | null; label?: string | null } | null;
  lastFunnelPage?: { id?: string | null; label?: string | null } | null;
  lastMediaFolder?: { id?: string | null; label?: string | null } | null;
  lastNurtureCampaign?: { id?: string | null; label?: string | null } | null;
};

export type ReviewReplyIntent = {
  reviewName: string;
  replyText: string;
};

export type NurtureStepIntent = {
  campaignId: string;
  kind: "EMAIL" | "SMS";
  delayMinutes: number;
  subject?: string;
  body: string;
};

export type DraftInboxReplyIntent = {
  contactName: string;
  topicHint: string | null;
};

export type LeadRunIntent = {
  kind?: "B2B" | "B2C";
  count?: number;
  niche?: string;
  location?: string;
  requireEmail?: boolean;
  requirePhone?: boolean;
  requireWebsite?: boolean;
};

export type PuraDirectIntentSignals = {
  compactPrompt: string;
  smsThreadWithName: string | null;
  inboxSearchQuery: string | null;
  inboxSearchChannel: "SMS" | "EMAIL" | "ALL" | null;
  contactDetailName: string | null;
  taskLookupQuery: string | null;
  reviewDetailName: string | null;
  shouldRunPreflightInboxSummary: boolean;
  shouldRunPreflightReceptionist: boolean;
  shouldRunPreflightReceptionistPeople: boolean;
  shouldRunPreflightReviewSummary: boolean;
  shouldRunPreflightWorkSummary: boolean;
  shouldRunPreflightCrossSurfaceNextSteps: boolean;
  draftInboxReplyIntent: DraftInboxReplyIntent | null;
  nurtureCampaignCreateTitle: string;
  newsletterCreateTitle: string;
  shouldTightenLatestNewsletter: boolean;
  shouldSendLatestNewsletter: boolean;
  blogCreateTitle: string;
  shouldPolishLatestBlog: boolean;
  shouldPublishLatestBlog: boolean;
  funnelCreateTitle: string;
  shouldCreateLandingPage: boolean;
  shouldGenerateLandingLayout: boolean;
  shouldUpdateCurrentFunnelPage: boolean;
  mediaFolderCreateTitle: string;
  mediaImportUrl: string | null;
  mediaImportFolderNameHint: string | null;
  shouldImportToNamedMediaFolder: boolean;
  shouldListLatestMediaFolder: boolean;
  shouldListReviewsWithoutReply: boolean;
  reviewReplyIntent: ReviewReplyIntent | null;
  nurtureStepIntent: NurtureStepIntent | null;
  leadRunIntent: LeadRunIntent | null;
  shouldListLatestLeads: boolean;
  shouldDraftLeadEmail: boolean;
  shouldSuggestBookingSlots: boolean;
  shouldUpdateBookingThankYou: boolean;
  shouldSetWeekdayAvailability: boolean;
  shouldAssessCrossSurfaceReadiness: boolean;
};

function safeContext(raw: unknown): PuraDirectIntentContext {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as PuraDirectIntentContext) : {};
}

function compactPromptText(prompt: string): string {
  return String(prompt || "")
    .toLowerCase()
    .replace(/[“”"'?!,;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanExtractedEntity(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/[.?!]+$/g, "")
    .trim();
}

function makePhraseHelpers(compactPrompt: string) {
  const hasAny = (...phrases: string[]) =>
    phrases.some((phrase) => {
      const value = String(phrase || "").trim().toLowerCase();
      return value ? compactPrompt.includes(value) : false;
    });

  const hasAll = (...groups: Array<string | string[]>) =>
    groups.every((group) => {
      const options = Array.isArray(group) ? group : [group];
      return options.some((option) => hasAny(option));
    });

  return { hasAny, hasAll };
}

function extractCreateNamedResource(prompt: string, resourceTerms: string[]): string {
  const resourcePattern = resourceTerms.map((term) => term.trim().replace(/\s+/g, "\\s+")).join("|");
  if (!resourcePattern) return "";
  const patterns = [
    new RegExp(`\\b(?:create|make|start|draft|build|write)\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?(?:${resourcePattern})\\s+(?:called|named)\\s+(.+?)(?:\\.|\\s+(?:for|with|that)\\b|$)`, "i"),
    new RegExp(`\\b(?:create|make|start|draft|build|write)\\s+(?:a\\s+|an\\s+)?(?:new\\s+)?(?:${resourcePattern})\\s+["“]?(.+?)["”]?(?:\\.|\\s+(?:for|with|that)\\b|$)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const matchIndex = typeof match?.index === "number" ? match.index : -1;
    if (matchIndex >= 0) {
      const prefix = prompt.slice(Math.max(0, matchIndex - 40), matchIndex).toLowerCase();
      if (/\b(?:open|edit|update|rewrite|revise|refine|polish|view)\b/.test(prefix) || /\bexisting\b/.test(prefix)) {
        continue;
      }
    }
    const value = typeof match?.[1] === "string" ? String(match[1]).trim().replace(/[".]+$/g, "").slice(0, 180) : "";
    if (value) return value;
  }
  return "";
}

function extractReviewReplyIntent(prompt: string): ReviewReplyIntent | null {
  const patterns = [
    /^reply\s+to\s+(.+?)'s\s+review\s+with\s+(.+?)\.?$/i,
    /^respond\s+to\s+(.+?)'s\s+review\s+(?:with|saying)\s+(.+?)\.?$/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const reviewName = typeof match?.[1] === "string" ? String(match[1]).trim() : "";
    const replyText = typeof match?.[2] === "string" ? String(match[2]).trim() : "";
    if (reviewName && replyText) return { reviewName, replyText };
  }
  return null;
}

function extractDraftInboxReplyIntent(prompt: string): DraftInboxReplyIntent | null {
  const patterns = [
    /\b(?:draft|write)\s+(?:me\s+)?a\s+reply\s+to\s+(.+?)(?:\s+about\s+(.+?))?[.?!]?$/i,
    /\b(?:draft|write)\s+(?:me\s+)?a\s+response\s+to\s+(.+?)(?:\s+about\s+(.+?))?[.?!]?$/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const contactName = typeof match?.[1] === "string" ? String(match[1]).trim() : "";
    const topicHint = typeof match?.[2] === "string" ? String(match[2]).trim().replace(/[.?!]+$/g, "") : "";
    if (contactName) {
      return {
        contactName,
        topicHint: topicHint || null,
      };
    }
  }
  return null;
}

function extractContactDetailName(prompt: string): string | null {
  const patterns = [
    /\b(?:show|give|tell)\s+me\s+(?:the\s+)?(?:important\s+)?details(?:\s+you\s+have)?\s+(?:for|on|about)\s+(.+?)[.?!]?$/i,
    /\bwhat\s+details\s+do\s+you\s+have\s+(?:for|on|about)\s+(.+?)[.?!]?$/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const name = cleanExtractedEntity(match?.[1]);
    if (name) return name;
  }
  return null;
}

function extractTaskLookupQuery(prompt: string): string | null {
  const patterns = [
    /\b(?:tell|show)\s+me\s+(?:which\s+)?task(?:s)?\s+(?:is|are)?\s*(?:about|for)\s+(.+?)[.?!]?$/i,
    /\bwhat\s+task(?:s)?\s+(?:is|are)?\s*(?:about|for)\s+(.+?)[.?!]?$/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const query = cleanExtractedEntity(match?.[1]);
    if (query) return query;
  }
  return null;
}

function extractReviewDetailName(prompt: string): string | null {
  const patterns = [
    /\bshow\s+me\s+the\s+review\s+from\s+(.+?)[.?!]?$/i,
    /\bwhat\s+did\s+(.+?)\s+say\s+in\s+(?:the\s+)?review[.?!]?$/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const name = cleanExtractedEntity(match?.[1]);
    if (name) return name;
  }
  return null;
}

function extractRelativeDelayMinutes(prompt: string): number {
  const explicitDayMatch = prompt.match(/\b(\d+)\s+day(?:s)?\s+later\b/i);
  if (explicitDayMatch?.[1]) return Number(explicitDayMatch[1]) * 24 * 60;
  if (/\bone\s+day\s+later\b/i.test(prompt)) return 24 * 60;
  const explicitHourMatch = prompt.match(/\b(\d+)\s+hour(?:s)?\s+later\b/i);
  if (explicitHourMatch?.[1]) return Number(explicitHourMatch[1]) * 60;
  if (/\bone\s+hour\s+later\b/i.test(prompt)) return 60;
  return 0;
}

function extractNurtureStepIntent(prompt: string, ctx: PuraDirectIntentContext, hasAny: (...phrases: string[]) => boolean): NurtureStepIntent | null {
  const campaignId = typeof ctx.lastNurtureCampaign?.id === "string" ? String(ctx.lastNurtureCampaign.id).trim() : "";
  if (!campaignId) return null;
  const kind = hasAny("sms step", "text step", "sms", "text message") ? "SMS" : hasAny("email step", "email message", "email") ? "EMAIL" : "";
  if (!kind || !hasAny("step")) return null;
  const delayMinutes = extractRelativeDelayMinutes(prompt);
  const body = (() => {
    if (hasAny("save their seat", "save your seat")) return kind === "SMS" ? "Reminder: save your seat for the webinar." : "Just a quick reminder to save your seat for the webinar.";
    if (hasAny("core promise", "teasing the core promise")) {
      return kind === "EMAIL"
        ? "Welcome to the webinar. We are excited to show you the core promise, what makes this approach different, and what to expect next."
        : "We cannot wait to show you the core promise in the webinar. Save your seat.";
    }
    if (hasAny("welcome", "welcoming")) {
      return kind === "EMAIL"
        ? "Welcome to the webinar. We are glad you are here and cannot wait to show you what is coming next."
        : "Welcome to the webinar. You are in.";
    }
    return kind === "EMAIL"
      ? "Here is your next nurture email, tailored to the user request in this thread."
      : "Here is your next nurture SMS, tailored to the user request in this thread.";
  })();
  const subject =
    kind === "EMAIL"
      ? hasAny("core promise", "teasing the core promise")
        ? "You are in: here is what the webinar will unlock"
        : "Welcome to the webinar"
      : undefined;
  return { campaignId, kind, delayMinutes, ...(subject ? { subject } : {}), body };
}

function extractLeadRunIntent(prompt: string, hasAny: (...phrases: string[]) => boolean, hasAll: (...groups: Array<string | string[]>) => boolean): LeadRunIntent | null {
  if (!hasAll(["find", "run", "pull", "scrape", "get"], ["lead", "leads"])) return null;
  const countMatch = prompt.match(/\b(\d{1,3})\b/);
  const locationMatch = prompt.match(/\bin\s+(.+?)(?:\s+with\b|\s+for\b|\.|$)/i);
  const nicheMatch = prompt.match(/(?:\b\d{1,3}\b\s+)?(.+?)\s+leads?\s+in\b/i);
  const count = Number(countMatch?.[1] || 0);
  const nicheRaw = typeof nicheMatch?.[1] === "string" ? String(nicheMatch[1]).trim() : "";
  const niche = nicheRaw.replace(/^(find|get|run|pull|scrape)\s+/i, "").trim();
  const location = typeof locationMatch?.[1] === "string" ? String(locationMatch[1]).trim().replace(/[.]+$/g, "") : "";
  return {
    ...(hasAny("b2b") ? { kind: "B2B" as const } : hasAny("b2c") ? { kind: "B2C" as const } : {}),
    ...(count > 0 ? { count } : {}),
    ...(niche ? { niche } : {}),
    ...(location ? { location } : {}),
    ...(hasAny("email required", "email address", "email addresses", "emails") ? { requireEmail: true } : {}),
    ...(hasAny("website required", "websites", "website and", "websites and") ? { requireWebsite: true } : {}),
    ...(hasAny("phone required", "phone numbers", "phones") ? { requirePhone: true } : {}),
  };
}

export function detectPuraDirectIntentSignals(promptRaw: string, threadContextRaw: unknown): PuraDirectIntentSignals {
  const prompt = String(promptRaw || "").trim();
  const compactPrompt = compactPromptText(prompt);
  const ctx = safeContext(threadContextRaw);
  const { hasAny, hasAll } = makePhraseHelpers(compactPrompt);
  const hasLatestNewsletterContext = Boolean(String(ctx.lastNewsletter?.id || "").trim());
  const hasLatestBlogContext = Boolean(String(ctx.lastBlogPost?.id || "").trim());
  const hasLatestFunnelPageContext = Boolean(String(ctx.lastFunnel?.id || "").trim() && String(ctx.lastFunnelPage?.id || "").trim());
  const smsThreadMatch = prompt.match(/\b(?:text|sms)\s+thread\s+with\s+(.+?)\s*\??$/i);
  const mediaImportUrlMatch = prompt.match(/https?:\/\/\S+/i);
  const mediaFolderNameMatch = prompt.match(/into\s+the\s+(.+?)\s+folder/i);
  const readinessDomainHits = ["newsletter", "blog", "nurture", "funnel", "media", "review", "booking", "lead scraping"].filter((term) => hasAny(term)).length;
  const crossSurfaceDomainHits = [
    hasAny("inbox", "conversation", "conversations", "thread", "threads") ? 1 : 0,
    hasAny("task", "tasks") ? 1 : 0,
    hasAny("contact", "contacts") ? 1 : 0,
    hasAny("review", "reviews") ? 1 : 0,
    hasAny("ai receptionist", "receptionist", "receptionist calls") ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const draftInboxReplyIntent = extractDraftInboxReplyIntent(prompt);
  const contactDetailName = extractContactDetailName(prompt);
  const taskLookupQuery = extractTaskLookupQuery(prompt);
  const reviewDetailName = extractReviewDetailName(prompt);
  const billingInboxSearchQuery = hasAny("invoice", "billing") && hasAny("inbox", "thread", "threads", "conversation", "conversations")
    ? (hasAny("invoice", "invoices") ? "invoice" : "billing")
    : null;
  const emailThreadMatch = prompt.match(/\b(?:email|conversation|thread)\s+with\s+(.+?)\s*\??$/i);
  const smsThreadWithName = cleanExtractedEntity(smsThreadMatch?.[1]);
  const emailThreadName = cleanExtractedEntity(emailThreadMatch?.[1]);
  const inboxSearchQuery = smsThreadWithName
    ? smsThreadWithName
    : billingInboxSearchQuery || (draftInboxReplyIntent?.contactName ?? null) || (emailThreadName || null);
  const inboxSearchChannel: "SMS" | "EMAIL" | "ALL" | null = smsThreadWithName
    ? "SMS"
    : hasAny("email thread", "email conversation")
      ? "EMAIL"
      : inboxSearchQuery
        ? "ALL"
        : null;

  return {
    compactPrompt,
    smsThreadWithName: smsThreadWithName || null,
    inboxSearchQuery,
    inboxSearchChannel,
    contactDetailName,
    taskLookupQuery,
    reviewDetailName,
    shouldRunPreflightInboxSummary:
      hasAny("summarize my inbox", "what needs attention", "what in my inbox needs attention", "inbox summary") ||
      hasAll(["conversation", "conversations", "customer conversations"], ["need a reply", "needs a reply", "need reply", "needs reply", "still need a reply", "still need replies", "need responses", "need response"]),
    shouldRunPreflightReceptionist: hasAny("recent ai receptionist calls", "ai receptionist calls", "receptionist calls", "recent receptionist calls"),
    shouldRunPreflightReceptionistPeople:
      hasAny("who came in through the ai receptionist recently", "who came in through the receptionist recently", "recent ai receptionist callers", "recent receptionist callers") ||
      hasAll(["ai receptionist", "receptionist"], ["who", "which people", "which callers"], ["recently", "recent", "lately"]) ||
      hasAll(["ai receptionist", "receptionist"], ["came in", "called", "callers", "people"], ["recently", "recent", "lately"]),
    shouldRunPreflightReviewSummary: hasAny("summarize my latest reviews", "latest reviews", "strongest feedback", "average rating", "reviews summary"),
    shouldRunPreflightWorkSummary:
      hasAny("quick work summary across tasks and inbox", "work summary across tasks and inbox", "summary across tasks and inbox") ||
      (hasAny("summary", "summarize", "recap") && hasAny("work") && hasAny("task", "tasks") && hasAny("inbox")),
    shouldRunPreflightCrossSurfaceNextSteps:
      crossSurfaceDomainHits >= 3 &&
      hasAny(
        "what should i do next",
        "what do i do next",
        "what should i tackle next",
        "what should i focus on next",
        "what needs my attention next",
        "next best action",
        "next best actions"
      ),
    draftInboxReplyIntent,
    nurtureCampaignCreateTitle: extractCreateNamedResource(prompt, ["nurture campaign", "campaign"]),
    newsletterCreateTitle: extractCreateNamedResource(prompt, ["newsletter"]),
    shouldTightenLatestNewsletter:
      hasAll(["tighten", "sharpen", "improve", "refine", "polish"], ["newsletter"], ["just created", "just made", "same newsletter", "that newsletter"]) ||
      (hasLatestNewsletterContext && hasAny("newsletter") && hasAny("tighten", "sharpen", "improve", "refine", "polish", "rewrite") && hasAny("latest", "last", "that", "this")),
    shouldSendLatestNewsletter: hasAll(["send", "push", "ship", "blast"], ["newsletter"], ["now", "out", "send it"]),
    blogCreateTitle: extractCreateNamedResource(prompt, ["blog draft", "blog post", "blog article", "blog"]),
    shouldPolishLatestBlog:
      hasAll(["polish", "tighten", "refine", "improve", "rewrite"], ["blog", "post", "draft"]) ||
      (hasLatestBlogContext && hasAny("blog", "post", "draft") && hasAny("polish", "tighten", "refine", "improve", "rewrite") && hasAny("latest", "last", "that", "this")),
    shouldPublishLatestBlog: hasAll(["publish", "post", "go live with"], ["blog", "post", "draft"]),
    funnelCreateTitle: extractCreateNamedResource(prompt, ["funnel"]),
    shouldCreateLandingPage: hasAll(["create", "make", "add", "build"], ["landing page", "signup page", "opt in page"], ["funnel", "same funnel", "that funnel"]),
    shouldGenerateLandingLayout: hasAll(["generate", "design", "build", "create"], ["layout", "page layout", "design"], ["landing page", "signup page", "page"]),
    shouldUpdateCurrentFunnelPage:
      hasLatestFunnelPageContext &&
      (hasAny("funnel builder", "same page", "that page", "current page", "hero", "headline", "subheadline", "bullet benefits", "call to action", "cta", "testimonial", "proof strip", "opt-in form", "form") ||
        /\b(hero|headline|subheadline|cta|testimonial|proof strip|opt-?in form|form)\b/i.test(prompt)) &&
      hasAny("replace", "update", "change", "rewrite", "revise", "add", "embed", "use", "keep", "leave"),
    mediaFolderCreateTitle: extractCreateNamedResource(prompt, ["media folder", "folder"]),
    mediaImportUrl: mediaImportUrlMatch?.[0] ? String(mediaImportUrlMatch[0]).trim() : null,
    mediaImportFolderNameHint: typeof mediaFolderNameMatch?.[1] === "string" ? String(mediaFolderNameMatch[1]).trim().replace(/[".]+$/g, "") : null,
    shouldImportToNamedMediaFolder: hasAll(["import", "upload", "add"], ["image", "photo", "asset"], ["folder"]) && Boolean(mediaImportUrlMatch),
    shouldListLatestMediaFolder: hasAll(["what is in", "show me", "list"], ["folder"]) && hasAny("right now", "in the folder", "inside the folder"),
    shouldListReviewsWithoutReply: hasAll(["review", "reviews"], ["without", "missing", "need"], ["business reply", "reply"]),
    reviewReplyIntent: extractReviewReplyIntent(prompt),
    nurtureStepIntent: extractNurtureStepIntent(prompt, ctx, hasAny),
    leadRunIntent: extractLeadRunIntent(prompt, hasAny, hasAll),
    shouldListLatestLeads: hasAll(["show me", "list", "what are", "what were"], ["lead", "leads"]) && hasAny("just pulled", "just found", "just scraped", "you just pulled", "you just found", "you just scraped"),
    shouldDraftLeadEmail: hasAll(["draft", "write", "create"], ["outbound email template", "email template", "outbound email"]),
    shouldSuggestBookingSlots: hasAll(["booking slots", "available slots", "slots this week", "suggest slots", "open booking times"], ["booking", "slots", "times"]),
    shouldUpdateBookingThankYou: hasAll(["update", "change", "set"], ["booking form", "booking page form"], ["thank you", "thank-you"], ["message"]),
    shouldSetWeekdayAvailability: hasAll(["set", "update"], ["weekday", "weekdays"], ["booking availability", "availability"], ["next 7 days", "this week", "next week"]),
    shouldAssessCrossSurfaceReadiness: readinessDomainHits >= 5 && hasAny("weak", "incomplete", "ready", "readiness", "status", "looks weak"),
  };
}
