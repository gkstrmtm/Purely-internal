type BusinessProfileContextInput = {
  businessName?: unknown;
  websiteUrl?: unknown;
  industry?: unknown;
  businessModel?: unknown;
  primaryGoals?: unknown;
  targetCustomer?: unknown;
  brandVoice?: unknown;
  businessContext?: unknown;
  guidedStageCount?: unknown;
  logoUrl?: unknown;
  brandPrimaryHex?: unknown;
  brandSecondaryHex?: unknown;
  brandAccentHex?: unknown;
  brandTextHex?: unknown;
  brandFontFamily?: unknown;
  brandFontGoogleFamily?: unknown;
};

export type BusinessProfileContextHealthLabel =
  | "Low context"
  | "Developing context"
  | "Strong context"
  | "Fully operational context";

export type BusinessProfileContextHealthTarget =
  | "logo"
  | "targetCustomer"
  | "brandVoice"
  | "businessContext";

export type BusinessProfileContextNextStep = {
  label: string;
  target: BusinessProfileContextHealthTarget;
  starter?: string;
};

export type BusinessProfileContextHealth = {
  score: number;
  label: BusinessProfileContextHealthLabel;
  explanation: string;
  assistantGuidance: string;
  nextSteps: BusinessProfileContextNextStep[];
  signals: {
    offer: boolean;
    audience: boolean;
    painPoints: boolean;
    pricing: boolean;
    serviceArea: boolean;
    proof: boolean;
    tone: boolean;
    brandAssets: boolean;
    ctaPreference: boolean;
    salesProcess: boolean;
    avoidClaims: boolean;
  };
};

function cleanText(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanParagraph(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanGoals(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const goals: string[] = [];
  for (const item of value) {
    const next = cleanText(item, 120);
    if (!next || goals.includes(next)) continue;
    goals.push(next);
    if (goals.length >= 10) break;
  }
  return goals;
}

function matches(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function buildExplanation(label: BusinessProfileContextHealthLabel) {
  if (label === "Low context") {
    return "Your company context is still light. Pura can help, but it will make broader assumptions until you add the core offer, audience, and a little operating detail.";
  }
  if (label === "Developing context") {
    return "Your company context is usable, but still mostly baseline. Pura can draft from it, but pricing, proof, process, and edge-case decisions still need more structured operating detail.";
  }
  if (label === "Strong context") {
    return "Your structured company context is strong. Pura has enough grounded detail to make better decisions about offers, audience, tone, CTA direction, and funnel structure.";
  }
  return "Your company context is fully operational. Pura can lean on saved business detail for nuanced copy, design direction, and conversion recommendations with fewer clarifying questions.";
}

function buildAssistantGuidance(label: BusinessProfileContextHealthLabel) {
  if (label === "Low context") {
    return "Assistant confidence should stay careful. Use saved details where they exist, avoid fake specificity, and ask only for the single missing detail that blocks a confident recommendation.";
  }
  if (label === "Developing context") {
    return "Assistant confidence can be moderate. Default to saved context first, but clearly mark assumptions around pricing, proof, and edge-case claims.";
  }
  if (label === "Strong context") {
    return "Assistant confidence can be high. Use saved company detail by default and only ask focused follow-ups when a missing field would materially change the recommendation.";
  }
  return "Assistant confidence can be high for nuanced work. Use saved context by default, minimize broad discovery questions, and keep recommendations specific unless runtime truth conflicts.";
}

function buildNextStep(label: string, target: BusinessProfileContextHealthTarget, starter?: string): BusinessProfileContextNextStep {
  return { label, target, starter };
}

export function assessBusinessProfileContextHealth(input: BusinessProfileContextInput): BusinessProfileContextHealth {
  const businessName = cleanText(input.businessName, 200);
  const websiteUrl = cleanText(input.websiteUrl, 500);
  const industry = cleanText(input.industry, 160);
  const businessModel = cleanText(input.businessModel, 200);
  const primaryGoals = cleanGoals(input.primaryGoals);
  const targetCustomer = cleanText(input.targetCustomer, 240);
  const brandVoice = cleanText(input.brandVoice, 240);
  const businessContext = cleanParagraph(input.businessContext, 8000);
  const guidedStageCount = Math.max(
    0,
    Math.min(6, Number.isFinite(Number(input.guidedStageCount)) ? Math.round(Number(input.guidedStageCount)) : 0),
  );
  const logoUrl = cleanText(input.logoUrl, 500);
  const brandPrimaryHex = cleanText(input.brandPrimaryHex, 16);
  const brandSecondaryHex = cleanText(input.brandSecondaryHex, 16);
  const brandAccentHex = cleanText(input.brandAccentHex, 16);
  const brandTextHex = cleanText(input.brandTextHex, 16);
  const brandFontFamily = cleanText(input.brandFontFamily, 200);
  const brandFontGoogleFamily = cleanText(input.brandFontGoogleFamily, 120);

  const contextBlob = [businessModel, targetCustomer, brandVoice, businessContext, primaryGoals.join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const offer = matches(contextBlob, /\b(offer|service|services|product|products|package|packages|program|programs|membership|subscription|consultation|audit|assessment|training|retainer|implementation|installation|plan|plans)\b/);
  const audience = Boolean(targetCustomer);
  const painPoints = Boolean(primaryGoals.length) || matches(contextBlob, /\b(problem|pain|struggle|friction|challenge|objection|hesitation|worry|issue|stuck|risk)\b/);
  const pricing = matches(contextBlob, /\b(price|pricing|starts at|starting at|investment|range|custom quote|quote|tier|tiers|budget|\$\d)\b/);
  const serviceArea = Boolean(websiteUrl) || matches(contextBlob, /\b(service area|serving|local|nationwide|remote|virtual|city|county|state|region|market|territory)\b/);
  const proof = matches(contextBlob, /\b(proof|review|reviews|testimonial|testimonials|case stud|results?|rating|trusted by|clients?|portfolio|credential|before and after)\b/);
  const tone = Boolean(brandVoice);
  const brandAssets = Boolean(logoUrl || brandPrimaryHex || brandSecondaryHex || brandAccentHex || brandTextHex || brandFontFamily || brandFontGoogleFamily);
  const ctaPreference = matches(contextBlob, /\b(book|schedule|call|quote|apply|buy|checkout|reserve|register|demo|contact us|get started|text us|message us)\b/);
  const salesProcess = matches(contextBlob, /\b(book|booking|schedule|quote|proposal|estimate|consultation|discovery|demo|follow[- ]?up|close|onboarding|delivery|fulfillment|approval)\b/);
  const avoidClaims = matches(contextBlob, /\b(avoid saying|do not say|don't say|never say|should avoid|cannot promise|can’t promise|do not promise|do not claim|off-brand|inaccurate)\b/);

  let rawScore = 0;
  if (businessName) rawScore += 6;
  if (websiteUrl) rawScore += 4;
  if (industry) rawScore += 4;
  if (businessModel) rawScore += 6;
  if (audience) rawScore += 10;
  if (primaryGoals.length) rawScore += 8;
  if (tone) rawScore += 8;
  if (businessContext.length >= 180) rawScore += 10;
  else if (businessContext.length >= 60) rawScore += 5;
  if (offer) rawScore += 10;
  if (pricing) rawScore += 8;
  if (serviceArea) rawScore += 6;
  if (proof) rawScore += 8;
  if (ctaPreference) rawScore += 5;
  if (salesProcess) rawScore += 7;
  if (avoidClaims) rawScore += 6;
  if (logoUrl) rawScore += 4;
  if (brandPrimaryHex || brandSecondaryHex || brandAccentHex || brandTextHex) rawScore += 4;
  if (brandFontFamily || brandFontGoogleFamily) rawScore += 4;
  if (guidedStageCount >= 1) rawScore += 4;
  if (guidedStageCount >= 2) rawScore += 6;
  if (guidedStageCount >= 4) rawScore += 6;

  const score = Math.max(0, Math.min(100, Math.round((rawScore / 118) * 100)));

  const strategicSignalCount = [
    offer,
    audience,
    painPoints,
    pricing,
    proof,
    tone,
    ctaPreference,
    salesProcess,
    avoidClaims,
  ].filter(Boolean).length;

  const hasStructuredOperatingContext =
    guidedStageCount >= 2 ||
    (businessContext.length >= 220 && strategicSignalCount >= 4);

  const hasFullyOperationalCoverage =
    guidedStageCount >= 4 ||
    (businessContext.length >= 500 && strategicSignalCount >= 6);

  const label: BusinessProfileContextHealthLabel = score <= 25
    ? "Low context"
    : score <= 50
      ? "Developing context"
      : score <= 75
        ? hasStructuredOperatingContext
          ? "Strong context"
          : "Developing context"
        : hasFullyOperationalCoverage
          ? "Fully operational context"
          : hasStructuredOperatingContext
            ? "Strong context"
            : "Developing context";

  const nextSteps = [
    !offer
      ? buildNextStep(
          "Add your main offer",
          "businessContext",
          "Primary offer: What exactly do you sell, who is it for, and what outcome does it create?",
        )
      : null,
    !pricing
      ? buildNextStep(
          "Add your usual price range",
          "businessContext",
          "Usual price range or starting investment: Include any baseline range, quote logic, or minimum engagement.",
        )
      : null,
    !audience ? buildNextStep("Add your target customer", "targetCustomer") : null,
    !proof
      ? buildNextStep(
          "Add one proof point",
          "businessContext",
          "Reusable proof point: Add one result, testimonial, credential, case study, or trust signal the AI should reuse.",
        )
      : null,
    !salesProcess
      ? buildNextStep(
          "Add your booking or sales process",
          "businessContext",
          "Booking or sales process: What happens after someone opts in, and how do they move toward a closed sale?",
        )
      : null,
    !ctaPreference
      ? buildNextStep(
          "Add your preferred CTA",
          "businessContext",
          "Preferred CTA: What exact next step should the page push most often?",
        )
      : null,
    !logoUrl ? buildNextStep("Upload logo", "logo") : null,
    !avoidClaims
      ? buildNextStep(
          "Add what Pura should avoid saying",
          "businessContext",
          "Avoid saying: List any claims, promises, or phrasing AI should not use.",
        )
      : null,
    !serviceArea
      ? buildNextStep(
          "Add your service area or market",
          "businessContext",
          "Service area or market: Where do you sell, serve, or take clients from?",
        )
      : null,
    !tone ? buildNextStep("Add your preferred tone", "brandVoice") : null,
  ].filter((step): step is BusinessProfileContextNextStep => Boolean(step)).slice(0, 4);

  return {
    score,
    label,
    explanation: buildExplanation(label),
    assistantGuidance: buildAssistantGuidance(label),
    nextSteps,
    signals: {
      offer,
      audience,
      painPoints,
      pricing,
      serviceArea,
      proof,
      tone,
      brandAssets,
      ctaPreference,
      salesProcess,
      avoidClaims,
    },
  };
}