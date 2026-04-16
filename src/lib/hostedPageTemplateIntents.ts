export type HostedTemplateService = "BOOKING" | "NEWSLETTER" | "REVIEWS" | "BLOGS";

type HostedTemplateOption = {
  pageKey: string;
  description: string;
  keywords: string[];
};

const DEFAULT_TEMPLATE_PAGE_KEY: Record<HostedTemplateService, string> = {
  BOOKING: "booking_main",
  NEWSLETTER: "newsletter_home",
  REVIEWS: "reviews_home",
  BLOGS: "blogs_index",
};

const TEMPLATE_OPTIONS: Record<HostedTemplateService, HostedTemplateOption[]> = {
  BOOKING: [
    {
      pageKey: "booking_main",
      description: "Modern booking page with bright spacing and a clean scheduling flow.",
      keywords: ["main", "modern", "clean", "bright", "default"],
    },
    {
      pageKey: "booking_concierge",
      description: "Warm, premium booking page with serif headlines and a hospitality feel.",
      keywords: ["concierge", "premium", "warm", "hospitality", "elevated", "luxury", "serif"],
    },
    {
      pageKey: "booking_event_night",
      description: "Dark high-contrast booking page built for launches, events, and campaigns.",
      keywords: ["event", "night", "dark", "launch", "campaign", "high contrast", "bold"],
    },
    {
      pageKey: "booking_minimal_clinic",
      description: "Minimal booking page with a quiet, professional layout and restrained styling.",
      keywords: ["minimal", "clinic", "professional", "quiet", "restrained", "simple"],
    },
  ],
  NEWSLETTER: [
    {
      pageKey: "newsletter_home",
      description: "Clean newsletter landing page with a bright archive layout.",
      keywords: ["home", "clean", "bright", "default"],
    },
    {
      pageKey: "newsletter_editorial",
      description: "Editorial newsletter page with softer tones and publication-style typography.",
      keywords: ["editorial", "publication", "magazine", "journalistic", "journal", "newsroom", "story-driven"],
    },
    {
      pageKey: "newsletter_digest",
      description: "Modern digest layout with concise copy and a crisp product-like feel.",
      keywords: ["digest", "concise", "product", "weekly", "roundup", "summary"],
    },
    {
      pageKey: "newsletter_launchpad",
      description: "Dark campaign-style newsletter page with bold contrast and launch energy.",
      keywords: ["launchpad", "launch", "campaign", "dark", "bold", "promo"],
    },
    {
      pageKey: "newsletter_community",
      description: "Warm newsletter page with a more personal tone.",
      keywords: ["community", "personal", "warm", "friendly", "welcoming"],
    },
  ],
  REVIEWS: [
    {
      pageKey: "reviews_home",
      description: "Bright trust-building reviews page with a clean modern layout.",
      keywords: ["home", "clean", "bright", "trust", "default"],
    },
    {
      pageKey: "reviews_concierge",
      description: "Soft premium reviews page with warmer color and a refined look.",
      keywords: ["concierge", "premium", "soft", "warm", "refined", "luxury"],
    },
    {
      pageKey: "reviews_story_wall",
      description: "Editorial story-led reviews page with softer contrast and narrative styling.",
      keywords: ["story wall", "story", "editorial", "narrative", "journalistic", "journal"],
    },
    {
      pageKey: "reviews_aftercare",
      description: "Calm aftercare reviews page with a thoughtful tone.",
      keywords: ["aftercare", "calm", "thoughtful", "care", "support", "relationship"],
    },
    {
      pageKey: "reviews_bold_wall",
      description: "High-contrast reviews page with louder visuals and stronger energy.",
      keywords: ["bold wall", "bold", "high contrast", "loud", "energetic", "strong"],
    },
  ],
  BLOGS: [
    {
      pageKey: "blogs_index",
      description: "Clean blog home with a bright archive layout for recent posts and updates.",
      keywords: ["home", "index", "archive", "clean", "default", "blog home", "blog index"],
    },
    {
      pageKey: "blogs_magazine",
      description: "Magazine-style blog home with warmer tones and editorial emphasis.",
      keywords: ["magazine", "editorial", "publication", "feature", "featured"],
    },
    {
      pageKey: "blogs_minimal",
      description: "Minimal blog archive with a quieter reading-first layout.",
      keywords: ["minimal", "simple", "reading", "quiet", "clean archive"],
    },
    {
      pageKey: "blogs_journal",
      description: "Journal-style blog home with a more reflective feel.",
      keywords: ["journal", "journalistic", "journalism", "reflective", "essay", "thoughtful writing"],
    },
    {
      pageKey: "blogs_post_template",
      description: "Standard article template with clear framing and related-reading sections.",
      keywords: ["post template", "article template", "single post", "standard article", "blog post"],
    },
    {
      pageKey: "blogs_post_featured",
      description: "Featured article template with a bolder hero and stronger visual framing.",
      keywords: ["featured post", "featured article", "visual", "bold post", "hero article"],
    },
    {
      pageKey: "blogs_post_minimal",
      description: "Minimal article template with low-distraction reading and simple navigation.",
      keywords: ["minimal post", "minimal article", "reading-first", "low distraction", "simple article"],
    },
  ],
};

function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePromptForMatching(value: string) {
  return normalizePrompt(value)
    .replace(/\bmak\b/g, "make")
    .replace(/\bminimul\b/g, "minimal")
    .replace(/\bjurnalistic\b/g, "journalistic")
    .replace(/\bproffesional\b/g, "professional")
    .replace(/\bpremimum\b/g, "premium");
}

export function hostedTemplateStyleDescription(pageKey: string) {
  for (const service of Object.keys(TEMPLATE_OPTIONS) as HostedTemplateService[]) {
    const option = TEMPLATE_OPTIONS[service].find((entry) => entry.pageKey === pageKey);
    if (option) return option.description;
  }
  return pageKey
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function listHostedTemplateOptions(service: HostedTemplateService) {
  return TEMPLATE_OPTIONS[service].map((entry) => ({ ...entry }));
}

export function resolveHostedTemplatePageKey(service: HostedTemplateService, prompt: string): string | null {
  const compactPrompt = normalizePromptForMatching(prompt);
  if (!compactPrompt) return null;

  const options = TEMPLATE_OPTIONS[service];
  const defaultPageKey = DEFAULT_TEMPLATE_PAGE_KEY[service];
  let bestDefault: { pageKey: string; score: number } | null = null;
  let bestSpecific: { pageKey: string; score: number } | null = null;

  for (const option of options) {
    let score = 0;
    if (compactPrompt.includes(option.pageKey.replace(/_/g, " "))) score += 100;
    for (const keyword of option.keywords) {
      const cleanKeyword = normalizePrompt(keyword);
      if (!cleanKeyword) continue;
      if (compactPrompt.includes(cleanKeyword)) {
        score += cleanKeyword.split(" ").length > 1 ? 14 : 8;
      }
    }
    if (score <= 0) continue;

    if (option.pageKey === defaultPageKey) {
      if (!bestDefault || score > bestDefault.score) {
        bestDefault = { pageKey: option.pageKey, score };
      }
      continue;
    }

    if (!bestSpecific || score > bestSpecific.score) {
      bestSpecific = { pageKey: option.pageKey, score };
    }
  }

  if (bestSpecific) return bestSpecific.pageKey;
  if (bestDefault) return bestDefault.pageKey;

  if (service === "BLOGS") {
    if (compactPrompt.includes("post") || compactPrompt.includes("article") || compactPrompt.includes("single")) {
      return "blogs_post_template";
    }
    return "blogs_index";
  }
  if (service === "BOOKING") return "booking_main";
  if (service === "NEWSLETTER") return "newsletter_home";
  return "reviews_home";
}