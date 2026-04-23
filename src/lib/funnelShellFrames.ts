import type { FunnelPageFormStrategy, FunnelPageIntentType } from "@/lib/funnelPageIntent";

export type FunnelShellFrame = {
  id: string;
  label: string;
  pageTypes: FunnelPageIntentType[];
  summary: string;
  shellConcept: string;
  sectionPlan: string;
  visualTone: string;
  proofModel: string;
  ctaRhythm: string;
  brandUse: string;
  designDirectives: string[];
  exhibit: {
    archetype: string;
    sector: string;
    designProfileId: string;
    categories: string[];
  };
};

const FUNNEL_SHELL_FRAMES: FunnelShellFrame[] = [
  {
    id: "booking-authority-editorial",
    label: "Authority Editorial Booking",
    pageTypes: ["booking", "landing", "home"],
    summary: "Premium consultation page that leads with authority, trust, and a calm booking handoff instead of hype.",
    shellConcept:
      "Build a premium editorial booking page that establishes authority in the hero, stages proof early, and makes the consultation feel like the natural next step for serious buyers.",
    sectionPlan:
      "Hero with authority-led promise -> proof strip -> what the consultation solves -> case-study or credibility stack -> what happens on the call -> booking CTA section -> FAQ -> final CTA close",
    visualTone: "Editorial, premium, restrained, and trust-first rather than loud or startup-generic.",
    proofModel: "Use credibility near the hero, then a deeper case-study or authority section before the main booking handoff.",
    ctaRhythm: "CTA in hero, after proof, and in the booking close. Do not oversaturate the page with repetitive buttons.",
    brandUse: "Use brand color selectively on CTAs and small accent surfaces only. Favor calm neutrals and atmospheric contrast over full-brand washes.",
    designDirectives: [
      "Use typography and spacing as the main emotional tools instead of decorative gradients everywhere.",
      "Keep proof adjacent to the first serious CTA.",
      "Use calm, premium contrast and avoid flashy startup-card sludge.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "high-ticket-application",
      designProfileId: "marketing-editorial",
      categories: ["Layout", "Cards", "Feedback", "Style Families", "Inputs"],
    },
  },
  {
    id: "booking-diagnostic-fit-first",
    label: "Diagnostic Fit-First Booking",
    pageTypes: ["booking", "application"],
    summary: "Fit-focused consultation shell for higher-friction discovery calls where qualification matters.",
    shellConcept:
      "Build a fit-first consultation page that screens for seriousness, clarifies who the call is for, and makes the booking step feel selective and worth earning.",
    sectionPlan:
      "Hero with fit statement -> who this is for / not for -> proof strip -> diagnostic outcomes -> how the consultation works -> qualification cues -> booking CTA section -> FAQ",
    visualTone: "Calm, selective, disciplined, and high-trust.",
    proofModel: "Use proof to reinforce fit and competence, not just social validation.",
    ctaRhythm: "Hero CTA, qualification checkpoint CTA, and one final booking handoff.",
    brandUse: "Keep the palette mostly neutral. Use brand only as a precision accent around booking or qualification cues.",
    designDirectives: [
      "Make qualification and seriousness feel intentional, not hostile.",
      "Use proof to support the selection logic.",
      "Prefer strong information hierarchy over decorative sectioning.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "high-ticket-application",
      designProfileId: "marketing-editorial",
      categories: ["Layout", "Cards", "Inputs", "Feedback"],
    },
  },
  {
    id: "lead-editorial-value-exchange",
    label: "Editorial Value Exchange",
    pageTypes: ["lead-capture", "landing"],
    summary: "Lead-capture shell that sells the payoff clearly before asking for the opt-in.",
    shellConcept:
      "Build a conversion-focused lead-capture page that makes the value exchange feel specific, credible, and immediately worth claiming.",
    sectionPlan:
      "Hero with value exchange -> proof strip -> what they get -> why it matters now -> capture section -> reassurance / objection handling -> FAQ -> final CTA",
    visualTone: "Clean, specific, confident, and conversion-aware.",
    proofModel: "Use quick proof before the form and a reassurance layer around the form itself.",
    ctaRhythm: "Hero CTA, form-adjacent CTA, and one close CTA.",
    brandUse: "Keep color focused on the offer and CTA state. Do not let brand accents compete with the value exchange.",
    designDirectives: [
      "Make the offer concrete within the first viewport.",
      "Use proof and reassurance to reduce opt-in friction.",
      "Keep the form moment visually obvious without making the page feel like a template.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "cold-traffic-lead",
      designProfileId: "marketing-editorial",
      categories: ["Layout", "Cards", "Inputs", "Feedback"],
    },
  },
  {
    id: "lead-audit-conversion-brief",
    label: "Audit Conversion Brief",
    pageTypes: ["lead-capture", "booking"],
    summary: "Offer-led shell for quotes, audits, assessments, or strategy briefs that need friction calibrated tightly.",
    shellConcept:
      "Build a conversion brief page that makes the audit or assessment feel concrete, high-value, and easy to request without turning the experience into a long worksheet.",
    sectionPlan:
      "Hero with audit promise -> proof or trust strip -> what the deliverable includes -> who it is for -> capture CTA section -> reassurance and expectations -> FAQ",
    visualTone: "Structured, confident, and modern without shouting.",
    proofModel: "Use proof to validate the quality of the outcome, not just the business broadly.",
    ctaRhythm: "Fast CTA above the fold, reinforced by proof, then one strong request section.",
    brandUse: "Use brand as a quiet signal in CTA treatment and small accents. Keep the frame mostly neutral and credible.",
    designDirectives: [
      "Make the deliverable feel real and tangible.",
      "Reduce perceived effort around the capture moment.",
      "Avoid oversized gradients or overly loud visual chrome.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "cold-traffic-lead",
      designProfileId: "marketing-editorial",
      categories: ["Layout", "Cards", "Inputs", "Feedback"],
    },
  },
  {
    id: "sales-proof-stack-premium",
    label: "Premium Proof Stack",
    pageTypes: ["sales", "checkout"],
    summary: "Sales page shell that uses hierarchy, proof, and objection handling to move toward purchase without gimmicks.",
    shellConcept:
      "Build a premium sales shell that frames the offer fast, establishes why it is credible, and uses proof plus objection handling to move the visitor into purchase confidently.",
    sectionPlan:
      "Hero with offer and CTA -> credibility strip -> offer breakdown -> benefits and outcomes -> proof stack -> objection handling -> purchase CTA section -> FAQ",
    visualTone: "Elevated, disciplined, and conversion-forward.",
    proofModel: "Use stacked proof moments rather than one lonely testimonial band at the bottom.",
    ctaRhythm: "CTA in hero, after offer breakdown, after proof, and in the closing purchase section.",
    brandUse: "Use brand selectively on CTA treatment and small highlight surfaces only. Let contrast, hierarchy, and trust do most of the work.",
    designDirectives: [
      "Do not build a generic SaaS template with random cards and gradients.",
      "Make the offer feel expensive in structure even before the copy finishes selling it.",
      "Use objection handling as design rhythm, not just a late FAQ dump.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "checkout-conversion",
      designProfileId: "commerce-showcase",
      categories: ["Layout", "Cards", "Pricing", "Commerce", "Feedback"],
    },
  },
  {
    id: "application-selective-screening",
    label: "Selective Screening",
    pageTypes: ["application", "booking"],
    summary: "Application shell that makes the program feel selective, valuable, and worth applying for.",
    shellConcept:
      "Build an application page that filters for fit, raises the perceived value of the next step, and makes the application feel like a serious but achievable move.",
    sectionPlan:
      "Hero with fit signal -> proof strip -> who this is for -> who it is not for -> expectations and process -> application CTA section -> FAQ -> close",
    visualTone: "Selective, confident, and quiet.",
    proofModel: "Use fit-confirming proof and outcomes that reinforce why this is worth applying for.",
    ctaRhythm: "Hero CTA, process CTA, and one final application handoff.",
    brandUse: "Keep the UI restrained. Use brand only to support emphasis, not to theatricalize the page.",
    designDirectives: [
      "Make expectations and process feel clear.",
      "Balance selectivity with reassurance.",
      "Avoid playful or overly promotional styling.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "high-ticket-application",
      designProfileId: "marketing-editorial",
      categories: ["Layout", "Inputs", "Feedback", "Cards"],
    },
  },
  {
    id: "webinar-promise-registration",
    label: "Promise Registration",
    pageTypes: ["webinar", "lead-capture"],
    summary: "Event registration shell that sells the promise and lowers hesitation around signing up.",
    shellConcept:
      "Build a webinar registration page that makes the event promise specific, credible, and time-sensitive without looking like a webinar template from 2017.",
    sectionPlan:
      "Hero with event promise -> speaker / authority strip -> outcomes and agenda -> proof or trust -> registration section -> FAQ -> urgency close",
    visualTone: "Modern, energetic, but still precise.",
    proofModel: "Use authority and agenda clarity before asking for the registration.",
    ctaRhythm: "Hero CTA, agenda CTA, registration section CTA, final urgency CTA.",
    brandUse: "Use brand as a measured event accent, not as a full-surface wash.",
    designDirectives: [
      "Keep the agenda digestible and visually clear.",
      "Use urgency carefully without spammy webinar tropes.",
      "Make the sign-up moment feel friction-light and immediate.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "webinar-event-registration",
      designProfileId: "marketing-editorial",
      categories: ["Layout", "Cards", "Inputs", "Feedback"],
    },
  },
  {
    id: "checkout-trust-reassurance",
    label: "Trust Reassurance Checkout",
    pageTypes: ["checkout", "sales"],
    summary: "Checkout-focused shell that strips away distraction and reinforces trust at the point of purchase.",
    shellConcept:
      "Build a checkout shell that removes noise, reinforces safety and clarity, and keeps the visitor focused on finishing the purchase.",
    sectionPlan:
      "Order summary hero -> reassurance strip -> what they are buying -> guarantee and trust -> checkout focus section -> support / FAQ",
    visualTone: "Calm, direct, and confidence-building.",
    proofModel: "Use purchase reassurance, guarantee framing, and trust badges more than long-form storytelling.",
    ctaRhythm: "Primary checkout action above the fold and one reinforcement near objection handling.",
    brandUse: "Keep checkout mostly neutral. Use brand minimally so clarity and trust stay dominant.",
    designDirectives: [
      "Reduce visual clutter aggressively.",
      "Keep purchase details easy to scan.",
      "Use trust and guarantee styling more than decorative flourish.",
    ],
    exhibit: {
      archetype: "conversion-funnel",
      sector: "checkout-conversion",
      designProfileId: "commerce-showcase",
      categories: ["Commerce", "Layout", "Feedback", "Cards"],
    },
  },
];

export function listFunnelShellFrames(pageType?: FunnelPageIntentType | null) {
  if (!pageType) return [...FUNNEL_SHELL_FRAMES];
  return FUNNEL_SHELL_FRAMES.filter((frame) => frame.pageTypes.includes(pageType));
}

export function getFunnelShellFrame(frameId?: string | null) {
  const cleanId = String(frameId || "").trim().toLowerCase();
  if (!cleanId) return null;
  return FUNNEL_SHELL_FRAMES.find((frame) => frame.id === cleanId) || null;
}

export function getDefaultFunnelShellFrameId(pageType: FunnelPageIntentType, formStrategy?: FunnelPageFormStrategy | null) {
  if (pageType === "booking") return formStrategy === "application" ? "booking-diagnostic-fit-first" : "booking-authority-editorial";
  if (pageType === "lead-capture") return "lead-editorial-value-exchange";
  if (pageType === "sales") return "sales-proof-stack-premium";
  if (pageType === "checkout") return "checkout-trust-reassurance";
  if (pageType === "application") return "application-selective-screening";
  if (pageType === "webinar") return "webinar-promise-registration";
  if (pageType === "landing") return "lead-editorial-value-exchange";
  if (pageType === "home") return "booking-authority-editorial";
  return "booking-authority-editorial";
}

export function resolveFunnelShellFrame(input: {
  frameId?: string | null;
  pageType: FunnelPageIntentType;
  formStrategy?: FunnelPageFormStrategy | null;
}) {
  const requested = getFunnelShellFrame(input.frameId);
  if (requested && requested.pageTypes.includes(input.pageType)) return requested;

  const fallbackId = getDefaultFunnelShellFrameId(input.pageType, input.formStrategy);
  return getFunnelShellFrame(fallbackId);
}