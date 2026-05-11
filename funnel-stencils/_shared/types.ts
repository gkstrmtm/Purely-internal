export const STENCIL_SCHEMA_VERSION = 1 as const;

export const FUNNEL_TYPES = [
  "lead_capture",
  "sales",
  "booking",
  "webinar",
  "multi_step",
  "tripwire",
] as const;

export type FunnelType = (typeof FUNNEL_TYPES)[number];

export const SECTION_ARCHETYPES = [
  "hero",
  "proof",
  "features",
  "workflow",
  "testimonials",
  "pricing",
  "faq",
  "form",
  "booking",
  "webinar_agenda",
  "checkout",
  "confirmation",
  "cta",
  "guarantee",
  "countdown_offer",
  "next_step",
] as const;

export type SectionArchetype = (typeof SECTION_ARCHETYPES)[number];

export const PLACEHOLDER_CATEGORIES = [
  "brand",
  "content",
  "form",
  "testimonial",
  "pricing",
  "booking",
  "webinar",
  "checkout",
  "confirmation",
] as const;

export type PlaceholderCategory = (typeof PLACEHOLDER_CATEGORIES)[number];

export type SourceTemplateRef = {
  repository: string;
  path: string;
  notes: string;
  patterns: string[];
};

export type PlaceholderToken = {
  token: string;
  category: PlaceholderCategory;
  description: string;
  required?: boolean;
  example?: string;
};

export type StencilSectionDefinition = {
  id: string;
  name: string;
  archetype: SectionArchetype;
  purpose: string;
  placeholderTokens: string[];
  optional?: boolean;
  sourcePatterns?: string[];
};

export type StencilPageDefinition = {
  id: string;
  name: string;
  goal: string;
  sections: string[];
  entry?: boolean;
  terminal?: boolean;
};

export type FunnelStencilManifest = {
  schemaVersion: typeof STENCIL_SCHEMA_VERSION;
  stencilId: string;
  funnelType: FunnelType;
  title: string;
  conversionGoal: string;
  notes: string[];
  sources: SourceTemplateRef[];
  placeholderTokens: PlaceholderToken[];
  sections: StencilSectionDefinition[];
  pages: StencilPageDefinition[];
  optionalSections?: string[];
};
