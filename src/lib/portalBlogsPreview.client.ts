"use client";

const STORAGE_KEY = "pa.portal.blogs.preview-state";

export type PreviewBlogSite = {
  id: string;
  name: string;
  slug: string | null;
  primaryDomain: string | null;
  verificationToken: string;
  verifiedAt: string | null;
};

export type PreviewBlogPost = {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  seoKeywords: string[] | null;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export type PreviewBlogAutomationSettings = {
  enabled: boolean;
  frequencyDays: number;
  topics: string[];
  autoPublish: boolean;
  lastGeneratedAt: string | null;
  nextDueAt: string | null;
  lastRunAt?: string | null;
};

export type PreviewBlogAppearance = {
  version: 1;
  useBrandFont: boolean;
  titleFontKey: string;
  bodyFontKey: string;
};

export type PreviewFunnelBuilderDomain = {
  id: string;
  domain: string;
  status: "PENDING" | "VERIFIED";
};

export type PreviewBlogState = {
  site: PreviewBlogSite | null;
  posts: PreviewBlogPost[];
  automation: PreviewBlogAutomationSettings;
  appearance: PreviewBlogAppearance;
  funnelDomains: PreviewFunnelBuilderDomain[];
  credits: number;
  blogCreditsUsed30d: number;
  blogGenerations30d: number;
};

function cloneDefaultState(): PreviewBlogState {
  return {
    site: null,
    posts: [],
    automation: {
      enabled: false,
      frequencyDays: 7,
      topics: ["seasonal offers", "common customer questions", "before and after project stories"],
      autoPublish: false,
      lastGeneratedAt: null,
      nextDueAt: null,
      lastRunAt: null,
    },
    appearance: {
      version: 1,
      useBrandFont: true,
      titleFontKey: "brand",
      bodyFontKey: "brand",
    },
    funnelDomains: [
      { id: "preview-domain-1", domain: "preview.purelylocal.dev", status: "VERIFIED" },
      { id: "preview-domain-2", domain: "launch.purelylocal.dev", status: "PENDING" },
    ],
    credits: 120,
    blogCreditsUsed30d: 0,
    blogGenerations30d: 0,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clampFrequencyDays(value: number) {
  return Math.min(30, Math.max(1, Math.floor(Number(value) || 7)));
}

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeState(raw: unknown): PreviewBlogState {
  const base = cloneDefaultState();
  if (!raw || typeof raw !== "object") return base;

  const value = raw as Partial<PreviewBlogState>;
  return {
    site: value.site && typeof value.site === "object" ? ({
      id: String(value.site.id || "preview-site"),
      name: String(value.site.name || "My Blog"),
      slug: value.site.slug ? String(value.site.slug) : null,
      primaryDomain: value.site.primaryDomain ? String(value.site.primaryDomain) : null,
      verificationToken: String(value.site.verificationToken || "preview-token"),
      verifiedAt: value.site.verifiedAt ? String(value.site.verifiedAt) : null,
    }) : null,
    posts: Array.isArray(value.posts)
      ? value.posts.map((post, index) => ({
          id: String(post.id || `preview-post-${index + 1}`),
          status: post.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
          slug: String(post.slug || `draft-${index + 1}`),
          title: String(post.title || "Untitled"),
          excerpt: String(post.excerpt || ""),
          content: String(post.content || ""),
          seoKeywords: Array.isArray(post.seoKeywords) ? post.seoKeywords.map((item) => String(item)) : [],
          publishedAt: post.publishedAt ? String(post.publishedAt) : null,
          archivedAt: post.archivedAt ? String(post.archivedAt) : null,
          updatedAt: String(post.updatedAt || nowIso()),
        }))
      : base.posts,
    automation: {
      enabled: Boolean(value.automation?.enabled ?? base.automation.enabled),
      frequencyDays: clampFrequencyDays(value.automation?.frequencyDays ?? base.automation.frequencyDays),
      topics: Array.isArray(value.automation?.topics)
        ? value.automation.topics.map((item) => String(item || "")).filter(Boolean)
        : base.automation.topics,
      autoPublish: Boolean(value.automation?.autoPublish ?? base.automation.autoPublish),
      lastGeneratedAt: value.automation?.lastGeneratedAt ? String(value.automation.lastGeneratedAt) : null,
      nextDueAt: value.automation?.nextDueAt ? String(value.automation.nextDueAt) : null,
      lastRunAt: value.automation?.lastRunAt ? String(value.automation.lastRunAt) : null,
    },
    appearance: {
      version: 1,
      useBrandFont: Boolean(value.appearance?.useBrandFont ?? base.appearance.useBrandFont),
      titleFontKey: String(value.appearance?.titleFontKey || base.appearance.titleFontKey),
      bodyFontKey: String(value.appearance?.bodyFontKey || base.appearance.bodyFontKey),
    },
    funnelDomains: Array.isArray(value.funnelDomains)
      ? value.funnelDomains.map((domain, index) => ({
          id: String(domain.id || `preview-domain-${index + 1}`),
          domain: String(domain.domain || `preview-${index + 1}.purelylocal.dev`),
          status: domain.status === "PENDING" ? "PENDING" : "VERIFIED",
        }))
      : base.funnelDomains,
    credits: Number.isFinite(value.credits) ? Number(value.credits) : base.credits,
    blogCreditsUsed30d: Number.isFinite(value.blogCreditsUsed30d)
      ? Number(value.blogCreditsUsed30d)
      : base.blogCreditsUsed30d,
    blogGenerations30d: Number.isFinite(value.blogGenerations30d)
      ? Number(value.blogGenerations30d)
      : base.blogGenerations30d,
  };
}

export function readPreviewBlogState(): PreviewBlogState {
  if (typeof window === "undefined") return cloneDefaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return cloneDefaultState();
  }
}

export function writePreviewBlogState(state: PreviewBlogState): PreviewBlogState {
  const normalized = normalizeState(state);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore preview persistence failures
    }
  }
  return normalized;
}

export function updatePreviewBlogState(mutator: (state: PreviewBlogState) => PreviewBlogState): PreviewBlogState {
  const next = mutator(readPreviewBlogState());
  return writePreviewBlogState(next);
}

export function createPreviewBlogSite(input: { name?: string; slug?: string; primaryDomain?: string | null }) {
  const nextName = String(input.name || "").trim() || "My Blog";
  const nextSlug = slugify(input.slug || nextName) || "my-blog";
  const nextDomain = String(input.primaryDomain || "").trim() || null;
  const nextDomainStatus = nextDomain
    ? readPreviewBlogState().funnelDomains.find((domain) => domain.domain.toLowerCase() === nextDomain.toLowerCase())?.status ?? null
    : null;

  return updatePreviewBlogState((state) => ({
    ...state,
    site: {
      id: state.site?.id || "preview-site",
      name: nextName,
      slug: nextSlug,
      primaryDomain: nextDomain,
      verificationToken: state.site?.verificationToken || "preview-token",
      verifiedAt: nextDomainStatus === "VERIFIED" ? nowIso() : null,
    },
  })).site;
}

export function savePreviewBlogSite(input: { name?: string; slug?: string; primaryDomain?: string | null }) {
  return createPreviewBlogSite(input);
}

export function savePreviewBlogAppearance(next: Partial<PreviewBlogAppearance>) {
  return updatePreviewBlogState((state) => ({
    ...state,
    appearance: {
      ...state.appearance,
      ...next,
      version: 1,
    },
  })).appearance;
}

export function savePreviewAutomationSettings(next: Partial<PreviewBlogAutomationSettings>) {
  const updated = updatePreviewBlogState((state) => ({
    ...state,
    automation: {
      ...state.automation,
      ...next,
      frequencyDays: clampFrequencyDays(next.frequencyDays ?? state.automation.frequencyDays),
      topics: Array.isArray(next.topics)
        ? next.topics.map((item) => String(item || "").trim()).filter(Boolean)
        : state.automation.topics,
    },
  }));
  return updated.automation;
}

export function createPreviewBlogPost(input?: { title?: string }) {
  const stamp = Date.now().toString(36);
  const nextTitle = String(input?.title || "").trim();
  const now = nowIso();
  const nextPost: PreviewBlogPost = {
    id: `preview-post-${stamp}`,
    status: "DRAFT",
    slug: slugify(nextTitle || `untitled-${stamp}`) || `untitled-${stamp}`,
    title: nextTitle,
    excerpt: "",
    content: "",
    seoKeywords: [],
    publishedAt: null,
    archivedAt: null,
    updatedAt: now,
  };

  updatePreviewBlogState((state) => ({
    ...state,
    posts: [nextPost, ...state.posts],
  }));

  return nextPost;
}

export function getPreviewBlogPost(postId: string) {
  return readPreviewBlogState().posts.find((post) => post.id === postId) ?? null;
}

export function savePreviewBlogPost(
  postId: string,
  next: Partial<Pick<PreviewBlogPost, "title" | "slug" | "excerpt" | "content" | "seoKeywords" | "publishedAt" | "archivedAt" | "status">>,
) {
  const updated = updatePreviewBlogState((state) => ({
    ...state,
    posts: state.posts.map((post) =>
      post.id === postId
        ? {
            ...post,
            ...next,
            seoKeywords: Array.isArray(next.seoKeywords)
              ? next.seoKeywords.map((item) => String(item || "").trim()).filter(Boolean)
              : post.seoKeywords,
            updatedAt: nowIso(),
          }
        : post,
    ),
  }));

  return updated.posts.find((post) => post.id === postId) ?? null;
}

export function publishPreviewBlogPost(postId: string) {
  const updated = savePreviewBlogPost(postId, {
    status: "PUBLISHED",
    publishedAt: getPreviewBlogPost(postId)?.publishedAt || nowIso(),
    archivedAt: null,
  });
  return updated;
}

export function archivePreviewBlogPost(postId: string, archived: boolean) {
  return savePreviewBlogPost(postId, {
    archivedAt: archived ? nowIso() : null,
  });
}

export function deletePreviewBlogPost(postId: string) {
  updatePreviewBlogState((state) => ({
    ...state,
    posts: state.posts.filter((post) => post.id !== postId),
  }));
}

export function buildPreviewCoverImageUrl(title: string) {
  const safeTitle = String(title || "Blog Post").trim() || "Blog Post";
  const lineOne = safeTitle.length > 28 ? `${safeTitle.slice(0, 28).trimEnd()}…` : safeTitle;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${safeTitle}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#edf4ff" />
          <stop offset="55%" stop-color="#f7f4ef" />
          <stop offset="100%" stop-color="#fef3e8" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)" />
      <circle cx="1300" cy="180" r="170" fill="#c7ddff" opacity="0.55" />
      <circle cx="230" cy="690" r="220" fill="#fde1c8" opacity="0.9" />
      <rect x="116" y="118" width="1368" height="664" rx="40" fill="#ffffff" fill-opacity="0.72" stroke="#d7dee8" />
      <text x="180" y="312" fill="#0f172a" font-family="Georgia, 'Times New Roman', serif" font-size="42" letter-spacing="2">LOCAL PREVIEW</text>
      <text x="180" y="430" fill="#111827" font-family="Georgia, 'Times New Roman', serif" font-size="84" font-weight="700">${lineOne.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
      <text x="180" y="520" fill="#475569" font-family="Arial, sans-serif" font-size="34">Blog cover placeholder for local styling review</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildPreviewGeneratedDraft(input: { prompt?: string; title?: string }) {
  const topic = String(input.prompt || input.title || "your next customer question").trim() || "your next customer question";
  const nextTitle = topic.length > 4 ? topic.replace(/^[a-z]/, (match) => match.toUpperCase()) : "A Better Blog Workflow";
  const nextExcerpt = `A clear, client-facing post about ${topic.toLowerCase()} with enough structure to style the preview and editor.`;
  const nextKeywords = [topic, "customer education", "local search visibility"];
  const nextContent = `## Why this matters

When prospects land on your site, they should understand the value quickly. This preview draft is here so you can style a realistic article without waiting on live generation.

## What readers should learn

- What the problem is
- Why it matters now
- What a sensible next step looks like

## A simple framework

Start with the customer's question, answer it directly, then connect it back to your offer in plain language.

## Close with action

End with a short invitation to book, call, or learn more so the page feels complete.`;

  return {
    title: nextTitle,
    excerpt: nextExcerpt,
    content: nextContent,
    seoKeywords: nextKeywords,
    coverImageAlt: nextTitle,
  };
}

export function createPreviewAutomationDraft() {
  const draft = buildPreviewGeneratedDraft({
    prompt: readPreviewBlogState().automation.topics[0] || "A new automated draft",
  });
  const nextPost = createPreviewBlogPost({ title: draft.title });

  const saved = savePreviewBlogPost(nextPost.id, {
    title: draft.title,
    slug: slugify(draft.title) || nextPost.slug,
    excerpt: draft.excerpt,
    content: draft.content,
    seoKeywords: draft.seoKeywords,
  });

  updatePreviewBlogState((state) => ({
    ...state,
    credits: Math.max(0, state.credits - 1),
    blogCreditsUsed30d: state.blogCreditsUsed30d + 1,
    blogGenerations30d: state.blogGenerations30d + 1,
    automation: {
      ...state.automation,
      lastGeneratedAt: nowIso(),
      lastRunAt: nowIso(),
      nextDueAt: new Date(Date.now() + clampFrequencyDays(state.automation.frequencyDays) * 86400000).toISOString(),
    },
  }));

  return saved;
}
