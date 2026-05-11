type BusinessProfileContextInput = {
  businessName?: unknown;
  websiteUrl?: unknown;
  industry?: unknown;
  businessModel?: unknown;
  primaryGoals?: unknown;
  targetCustomer?: unknown;
  brandVoice?: unknown;
  businessContext?: unknown;
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

export type BusinessProfileContextHealth = {
  score: number;
  label: BusinessProfileContextHealthLabel;
  explanation: string;
  assistantGuidance: string;
  nextSteps: string[];
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
    return "Your company context is usable, but thin. Pura can draft from it, but pricing, proof, and edge-case decisions may still need extra guidance.";
  }
  if (label === "Strong context") {
    return "Your company context is strong. Pura has enough detail to make better decisions about offers, audience, tone, CTA direction, and funnel structure.";
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

export function assessBusinessProfileContextHealth(input: BusinessProfileContextInput): BusinessProfileContextHealth {
  const businessName = cleanText(input.businessName, 200);
  const websiteUrl = cleanText(input.websiteUrl, 500);
  const industry = cleanText(input.industry, 160);
  const businessModel = cleanText(input.businessModel, 200);
  const primaryGoals = cleanGoals(input.primaryGoals);
  const targetCustomer = cleanText(input.targetCustomer, 240);
  const brandVoice = cleanText(input.brandVoice, 240);
  const businessContext = cleanParagraph(input.businessContext, 8000);
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

  const score = Math.max(0, Math.min(100, Math.round((rawScore / 118) * 100)));

  const label: BusinessProfileContextHealthLabel = score <= 25
    ? "Low context"
    : score <= 50
      ? "Developing context"
      : score <= 75
        ? "Strong context"
        : "Fully operational context";

  const nextSteps = [
    !offer ? "Add your main offer" : "",
    !pricing ? "Add your usual price range" : "",
    !audience ? "Add your target customer" : "",
    !proof ? "Add one proof point" : "",
    !salesProcess ? "Add your booking or sales process" : "",
    !ctaPreference ? "Add your preferred CTA" : "",
    !logoUrl ? "Upload logo" : "",
    !avoidClaims ? "Add what Pura should avoid saying" : "",
    !serviceArea ? "Add your service area or market" : "",
    !tone ? "Add your preferred tone" : "",
  ].filter(Boolean).slice(0, 4);

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