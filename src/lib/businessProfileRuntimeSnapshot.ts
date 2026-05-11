import {
  BUSINESS_PROFILE_PATH_STAGES,
  type BusinessProfileGuidedIntake,
} from "@/lib/businessProfilePath";

const GUIDED_INTAKE_START = "[[GUIDED_INTAKE_START]]";
const GUIDED_INTAKE_END = "[[GUIDED_INTAKE_END]]";

function safeLine(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function safeParagraph(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function safeUrl(value: unknown, maxLen: number) {
  const next = safeLine(value, maxLen);
  if (!next) return "";
  return /^https?:\/\//i.test(next) ? next : next;
}

export function normalizeBusinessProfileRuntimeGoals(
  value: unknown,
  limit = 10,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => safeLine(entry, 80))
    .filter(Boolean)
    .slice(0, limit);
}

function joinGuidedStageAnswers(answers: string[] | undefined) {
  if (!Array.isArray(answers)) return "";
  return answers
    .map((answer) => safeParagraph(answer, 1200))
    .filter(Boolean)
    .join("\n\n");
}

export function stripGuidedIntakeContext(value: unknown) {
  const source = String(typeof value === "string" ? value : "");
  const start = source.indexOf(GUIDED_INTAKE_START);
  if (start < 0) return safeParagraph(source, 8000);
  const end = source.indexOf(GUIDED_INTAKE_END, start);
  const before = safeParagraph(source.slice(0, start), 8000);
  const after =
    end >= 0
      ? safeParagraph(source.slice(end + GUIDED_INTAKE_END.length), 8000)
      : "";
  return [before, after].filter(Boolean).join("\n\n");
}

export function buildGuidedIntakeContextBlock(
  guidedIntake: BusinessProfileGuidedIntake | null | undefined,
) {
  const sections = BUSINESS_PROFILE_PATH_STAGES.flatMap((stage) => {
    const answers = joinGuidedStageAnswers(guidedIntake?.[stage.key]);
    return answers ? [`${stage.label}\n${answers}`] : [];
  });

  if (!sections.length) return "";

  return [
    GUIDED_INTAKE_START,
    "Guided intake answers",
    ...sections,
    GUIDED_INTAKE_END,
  ].join("\n\n");
}

export function mergeBusinessProfileRuntimeContext(input: {
  businessContext?: unknown;
  guidedIntake?: BusinessProfileGuidedIntake | null | undefined;
}) {
  const base = stripGuidedIntakeContext(input.businessContext);
  const guided = buildGuidedIntakeContextBlock(input.guidedIntake);
  return [base, guided].filter(Boolean).join("\n\n");
}

export function resolveBusinessProfileRuntimeSnapshot(input: {
  profile?: Record<string, unknown> | null;
  draftProfile?: Record<string, unknown> | null;
  guidedIntake?: BusinessProfileGuidedIntake | null | undefined;
}) {
  const profile = input.profile ?? {};
  const draftProfile = input.draftProfile ?? {};
  const pick = (key: string) =>
    Object.prototype.hasOwnProperty.call(draftProfile, key)
      ? draftProfile[key]
      : profile[key];

  return {
    businessName: safeLine(pick("businessName"), 200),
    websiteUrl: safeUrl(pick("websiteUrl"), 400),
    industry: safeLine(pick("industry"), 160),
    businessModel: safeLine(pick("businessModel"), 240),
    primaryGoals: normalizeBusinessProfileRuntimeGoals(pick("primaryGoals")),
    targetCustomer: safeLine(pick("targetCustomer"), 240),
    brandVoice: safeLine(pick("brandVoice"), 240),
    businessContext: mergeBusinessProfileRuntimeContext({
      businessContext: pick("businessContext"),
      guidedIntake: input.guidedIntake,
    }),
    logoUrl: safeUrl(pick("logoUrl"), 500),
    brandPrimaryHex: safeLine(pick("brandPrimaryHex"), 16),
    brandSecondaryHex: safeLine(pick("brandSecondaryHex"), 16),
    brandAccentHex: safeLine(pick("brandAccentHex"), 16),
    brandTextHex: safeLine(pick("brandTextHex"), 16),
    brandFontFamily: safeLine(pick("brandFontFamily"), 120),
    brandFontGoogleFamily: safeLine(pick("brandFontGoogleFamily"), 160),
  };
}