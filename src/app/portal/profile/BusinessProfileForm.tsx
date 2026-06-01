"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PortalMediaPickerModal,
  type PortalMediaPickItem,
} from "@/components/PortalMediaPickerModal";
import { useToast } from "@/components/ToastProvider";
import {
  assessBusinessProfileContextHealth,
  type BusinessProfileContextNextStep,
} from "@/lib/businessProfileContextHealth";
import {
  buildBusinessProfileGuidedIntakeFromBriefing,
  buildBusinessProfilePathProgress,
  BUSINESS_PROFILE_PATH_STAGE_BY_KEY,
  BUSINESS_PROFILE_PATH_STAGES,
  type BusinessProfileBriefing,
  type BusinessProfileGuidedIntake,
  type BusinessProfilePathStageKey,
} from "@/lib/businessProfilePath";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import {
  applyFontPresetToStyle,
  fontPresetKeyFromStyle,
} from "@/lib/fontPresets";

type BusinessProfile = {
  businessName: string;
  websiteUrl: string | null;
  industry: string | null;
  businessModel: string | null;
  primaryGoals: unknown;
  targetCustomer: string | null;
  brandVoice: string | null;
  businessContext?: string | null;

  logoUrl?: string | null;
  brandPrimaryHex?: string | null;
  brandSecondaryHex?: string | null;
  brandAccentHex?: string | null;
  brandTextHex?: string | null;

  brandFontFamily?: string | null;
  brandFontGoogleFamily?: string | null;
  updatedAt?: string;

  hostedTheme?: {
    version: 1;
    bgHex: string | null;
    surfaceHex: string | null;
    softHex: string | null;
    borderHex: string | null;
    textHex: string | null;
    mutedTextHex: string | null;
    primaryHex: string | null;
    accentHex: string | null;
    linkHex: string | null;
  };
};

type BusinessProfileDraft = {
  businessName?: string;
  websiteUrl?: string;
  industry?: string;
  businessModel?: string;
  primaryGoals?: string[];
  targetCustomer?: string;
  brandVoice?: string;
  businessContext?: string;
  logoUrl?: string;
  brandPrimaryHex?: string;
  brandSecondaryHex?: string;
  brandAccentHex?: string;
  brandTextHex?: string;
  brandFontFamily?: string;
  brandFontGoogleFamily?: string;
  hostedTheme?: {
    bgHex?: string;
    surfaceHex?: string;
    softHex?: string;
    borderHex?: string;
    textHex?: string;
    mutedTextHex?: string;
    primaryHex?: string;
    accentHex?: string;
    linkHex?: string;
  };
};

type ApiGet = {
  ok: boolean;
  profile: BusinessProfile | null;
  draftProfile?: BusinessProfileDraft | null;
  clarification?: ApiClarify | null;
  briefing?: BusinessProfileBriefing | null;
  guidedIntake?: BusinessProfileGuidedIntake | null;
};

type ApiPut = { ok: boolean; profile: BusinessProfile };

type ApiBriefExtract = {
  ok: boolean;
  briefing?: BusinessProfileBriefing | null;
  guidedIntake?: BusinessProfileGuidedIntake | null;
  error?: string;
};

type ApiMediaUpload = {
  ok?: boolean;
  error?: string;
  items?: PortalMediaPickItem[];
};

type ClarificationQuestion = {
  question: string;
  reason: string;
  suggestedAnswerStarter?: string;
};

type ApiClarify = {
  ok: boolean;
  summary: string;
  questions: ClarificationQuestion[];
  recommendedContext?: string;
  sourceSignature?: string;
  generatedAt?: string;
};

type ApiPolish = {
  ok: boolean;
  polished?: string;
  error?: string;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const GUIDED_INTAKE_START = "[[GUIDED_INTAKE_START]]";
const GUIDED_INTAKE_END = "[[GUIDED_INTAKE_END]]";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(
  source: Window & typeof globalThis,
): SpeechRecognitionCtor | null {
  const scoped = source as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };

  return scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition ?? null;
}

function normalizeWhitespace(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCurrencyInput(value: string) {
  return String(value || "").replace(/[^\d.]/g, "").replace(/(\.\d{0,2}).*$/, "$1");
}

function formatCurrencyDisplay(value: string) {
  const numeric = Number(normalizeCurrencyInput(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
}

type PricingMode = "exact" | "startingAt" | "range";

const COMMON_BILLING_UNITS = [
  "per month",
  "per week",
  "per project",
  "per session",
  "per visit",
  "per activation",
  "one-time",
  "custom",
] as const;

function parsePricingAnswer(answer: string) {
  const clean = normalizeWhitespace(answer);
  const amounts = Array.from(clean.matchAll(/\$?([\d,]+(?:\.\d{1,2})?)/g)).map((match) => match[1] || "");
  const cadenceMatch = clean.match(/(?:per|\/)\s*([a-z][a-z -]{1,40})/i);
  const cadence = cadenceMatch ? `per ${cadenceMatch[1].trim()}` : "";
  const mode: PricingMode = amounts.length >= 2 ? "range" : /start/i.test(clean) ? "startingAt" : "exact";
  return {
    mode,
    amount: amounts[0] ? normalizeCurrencyInput(amounts[0]) : "",
    amountMax: amounts[1] ? normalizeCurrencyInput(amounts[1]) : "",
    cadence,
  };
}

function resolveBillingUnitOption(cadence: string) {
  const normalized = normalizeWhitespace(cadence).toLowerCase();
  if (!normalized) return "";
  const match = COMMON_BILLING_UNITS.find((option) => option === normalized);
  return match ?? "custom";
}

function buildGuidedAnswerKey(
  stageKey: BusinessProfilePathStageKey,
  questionIndex: number,
) {
  return `${stageKey}:${questionIndex}`;
}

function buildPricingAnswer(input: {
  mode: PricingMode;
  amount?: string;
  amountMax?: string;
  cadence?: string;
}) {
  const amount = formatCurrencyDisplay(input.amount || "");
  const amountMax = formatCurrencyDisplay(input.amountMax || "");
  const cadence = normalizeWhitespace(input.cadence || "");
  const cadenceSuffix = cadence ? ` ${cadence}` : "";
  if (input.mode === "range" && amount && amountMax) {
    return `Typical price range: ${amount}-${amountMax}${cadenceSuffix}.`;
  }
  if (input.mode === "startingAt" && amount) {
    return `Pricing starts at ${amount}${cadenceSuffix}.`;
  }
  if (amount) {
    return `Typical price: ${amount}${cadenceSuffix}.`;
  }
  return "";
}

function parseOutcomeAnswer(answer: string) {
  const clean = normalizeWhitespace(answer);
  const outcomeMatch = clean.match(/Primary outcome:\s*([^\.]+(?:\.[^A-Z][^\.]*)*)/i);
  const impactMatch = clean.match(/Business impact:\s*([^\.]+(?:\.[^A-Z][^\.]*)*)/i);
  return {
    primaryOutcome: normalizeWhitespace(outcomeMatch?.[1] || ""),
    businessImpact: normalizeWhitespace(impactMatch?.[1] || ""),
  };
}

function buildOutcomeAnswer(input: {
  primaryOutcome?: string;
  businessImpact?: string;
}) {
  const primaryOutcome = normalizeWhitespace(input.primaryOutcome || "");
  const businessImpact = normalizeWhitespace(input.businessImpact || "");
  if (primaryOutcome && businessImpact) {
    return `Primary outcome: ${primaryOutcome}. Business impact: ${businessImpact}.`;
  }
  if (primaryOutcome) return primaryOutcome;
  if (businessImpact) return `Business impact: ${businessImpact}.`;
  return "";
}

function getGuidedQuestionHeading(
  stageKey: BusinessProfilePathStageKey,
  questionIndex: number,
) {
  if (stageKey === "offerPricing") {
    return ["Main offer", "Pricing", "Outcome"][questionIndex] ?? `Question ${questionIndex + 1}`;
  }
  return `Question ${questionIndex + 1}`;
}

function OfferQuestionQuickFill({
  questionIndex,
  answer,
  readOnly,
  onChange,
  onCommit,
}: {
  questionIndex: number;
  answer: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const inputClassName =
    "mt-1 w-full rounded-xl border border-zinc-100 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors focus:border-zinc-300 disabled:opacity-70";
  const selectClassName =
    "mt-1 w-full appearance-none rounded-xl border border-zinc-100 bg-white px-3 py-2 pr-10 text-sm text-zinc-800 outline-none transition-colors focus:border-zinc-300 disabled:opacity-70";
  const helperPanelClassName =
    "mt-2 rounded-2xl bg-stone-100/90 px-3 py-3 text-zinc-800 ring-1 ring-inset ring-stone-200/80";
  const parsedPricing = parsePricingAnswer(answer);
  const parsedBillingUnitOption = resolveBillingUnitOption(parsedPricing.cadence);
  const [pricingMode, setPricingMode] = useState<PricingMode>(parsedPricing.mode);
  const [billingUnitChoice, setBillingUnitChoice] = useState(parsedBillingUnitOption);

  useEffect(() => {
    if (questionIndex !== 1) return;
    if (!normalizeWhitespace(answer)) return;
    setPricingMode(parsedPricing.mode);
    setBillingUnitChoice(parsedBillingUnitOption);
  }, [answer, parsedBillingUnitOption, parsedPricing.mode, questionIndex]);

  if (questionIndex === 0) {
    return (
      <div className={helperPanelClassName}>
        <div className="text-[11px] font-medium text-zinc-500">
          Quick Fill
        </div>
        <div className="mt-1 text-xs leading-5 text-zinc-600">
          Write the plain-language offer the business wants pages to lead with. Keep it readable first. The structure for service cards can be derived later.
        </div>
        <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-zinc-700 ring-1 ring-inset ring-stone-200/70">
          Example: Luxury resident events for apartment communities that need better retention.
        </div>
      </div>
    );
  }

  if (questionIndex === 1) {
    const parsed = parsedPricing;
    const showCustomBillingUnit =
      billingUnitChoice === "custom" || !billingUnitChoice;
    const activeCadence =
      billingUnitChoice && billingUnitChoice !== "custom"
        ? billingUnitChoice
        : parsed.cadence;
    const commitPricingAnswer = (next: Partial<typeof parsed> = {}) =>
      onCommit(
        buildPricingAnswer({
          mode: pricingMode,
          amount: next.amount ?? parsed.amount,
          amountMax: next.amountMax ?? parsed.amountMax,
          cadence: next.cadence ?? activeCadence,
        }),
      );
    const modeOptions: Array<{ key: PricingMode; label: string }> = [
      { key: "exact", label: "Exact" },
      { key: "startingAt", label: "Starts at" },
      { key: "range", label: "Range" },
    ];

    return (
      <div className={helperPanelClassName}>
        <div className="text-[11px] font-medium text-zinc-500">
          Quick Fill
        </div>
        <div className="mt-1 text-xs leading-5 text-zinc-600">
          Use literal pricing here. A clean number or range gives later page and offer setup a better starting point.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {modeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={Boolean(readOnly)}
              onClick={() => {
                setPricingMode(option.key);
              }}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                pricingMode === option.key
                  ? "border-brand-ink bg-white text-brand-ink"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                readOnly ? "opacity-70" : "",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-zinc-600">
            {pricingMode === "range" ? "Low end" : "Amount"}
            <input
              value={parsed.amount}
              onChange={(e) =>
                onChange(
                  buildPricingAnswer({
                    mode: pricingMode,
                    amount: normalizeCurrencyInput(e.target.value),
                    amountMax: parsed.amountMax,
                    cadence: activeCadence,
                  }),
                )
              }
              onBlur={(e) =>
                commitPricingAnswer({
                  amount: normalizeCurrencyInput(e.target.value),
                })
              }
              disabled={Boolean(readOnly)}
              inputMode="decimal"
              className={inputClassName}
              placeholder="3500"
            />
          </label>
          {pricingMode === "range" ? (
            <label className="text-xs font-medium text-zinc-600">
              High end
              <input
                value={parsed.amountMax}
                onChange={(e) =>
                  onChange(
                    buildPricingAnswer({
                      mode: pricingMode,
                      amount: parsed.amount,
                      amountMax: normalizeCurrencyInput(e.target.value),
                      cadence: activeCadence,
                    }),
                  )
                }
                onBlur={(e) =>
                  commitPricingAnswer({
                    amountMax: normalizeCurrencyInput(e.target.value),
                  })
                }
                disabled={Boolean(readOnly)}
                inputMode="decimal"
                className={inputClassName}
                placeholder="8000"
              />
            </label>
          ) : null}
          <label className="text-xs font-medium text-zinc-600 sm:col-span-1">
            Billing unit
            <div className="relative mt-1">
              <select
                value={billingUnitChoice}
                onChange={(e) => {
                  const nextOption = e.target.value;
                  setBillingUnitChoice(nextOption);
                  onChange(
                    buildPricingAnswer({
                      mode: pricingMode,
                      amount: parsed.amount,
                      amountMax: parsed.amountMax,
                      cadence:
                        nextOption && nextOption !== "custom" ? nextOption : parsed.cadence,
                    }),
                  );
                }}
                onBlur={() => commitPricingAnswer()}
                disabled={Boolean(readOnly)}
                className={selectClassName}
              >
                <option value="">Select one</option>
                {COMMON_BILLING_UNITS.map((option) => (
                  <option key={option} value={option}>
                    {option === "custom"
                      ? "Custom"
                      : option.replace(/^per\s/, "Per ").replace(/^one-time$/, "One-time")}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-zinc-400"
                strokeWidth="1.8"
              >
                <path d="M5 7.5 10 12.5l5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </label>
          {showCustomBillingUnit ? (
            <label className="text-xs font-medium text-zinc-600 sm:col-span-3">
              Custom billing unit
              <input
                value={parsed.cadence}
                onChange={(e) =>
                  onChange(
                    buildPricingAnswer({
                      mode: pricingMode,
                      amount: parsed.amount,
                      amountMax: parsed.amountMax,
                      cadence: e.target.value,
                    }),
                  )
                }
                onBlur={(e) => commitPricingAnswer({ cadence: e.target.value })}
                disabled={Boolean(readOnly)}
                className={inputClassName}
                placeholder="per activation"
              />
            </label>
          ) : null}
        </div>
      </div>
    );
  }

  if (questionIndex === 2) {
    const parsed = parseOutcomeAnswer(answer);
    return (
      <div className={helperPanelClassName}>
        <div className="text-[11px] font-medium text-zinc-500">
          Quick Fill
        </div>
        <div className="mt-1 text-xs leading-5 text-zinc-600">
          Separate the customer-facing outcome from the business payoff so downstream pages can pull the right angle.
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-600">
            Primary outcome
            <input
              value={parsed.primaryOutcome}
              onChange={(e) =>
                onChange(
                  buildOutcomeAnswer({
                    primaryOutcome: e.target.value,
                    businessImpact: parsed.businessImpact,
                  }),
                )
              }
              onBlur={() => onCommit(buildOutcomeAnswer(parsed))}
              disabled={Boolean(readOnly)}
              className={inputClassName}
              placeholder="Stronger resident sentiment"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Business impact
            <input
              value={parsed.businessImpact}
              onChange={(e) =>
                onChange(
                  buildOutcomeAnswer({
                    primaryOutcome: parsed.primaryOutcome,
                    businessImpact: e.target.value,
                  }),
                )
              }
              onBlur={() => onCommit(buildOutcomeAnswer(parsed))}
              disabled={Boolean(readOnly)}
              className={inputClassName}
              placeholder="Better renewals and premium positioning"
            />
          </label>
        </div>
      </div>
    );
  }

  return null;
}

function stripGuidedIntakeContext(value: string) {
  const source = String(value || "");
  const start = source.indexOf(GUIDED_INTAKE_START);
  if (start < 0) return normalizeWhitespace(source);
  const end = source.indexOf(GUIDED_INTAKE_END, start);
  const before = normalizeWhitespace(source.slice(0, start));
  const after =
    end >= 0
      ? normalizeWhitespace(source.slice(end + GUIDED_INTAKE_END.length))
      : "";
  return [before, after].filter(Boolean).join("\n\n");
}

function appendUniqueBlock(existing: string, addition: string) {
  const current = normalizeWhitespace(existing);
  const next = normalizeWhitespace(addition);
  if (!next) return current;
  if (current.includes(next)) return current;
  return current ? `${current}\n\n${next}` : next;
}

function normalizeGuidedIntake(
  guidedIntake: BusinessProfileGuidedIntake | null | undefined,
) {
  if (!guidedIntake) return null;
  const next: BusinessProfileGuidedIntake = {};
  for (const stage of BUSINESS_PROFILE_PATH_STAGES) {
    const rawAnswers = Array.isArray(guidedIntake[stage.key])
      ? (guidedIntake[stage.key] ?? [])
      : [];
    const answers = stage.questions.map((_, index) =>
      normalizeWhitespace(String(rawAnswers[index] || "")).slice(0, 1200),
    );
    if (answers.some(Boolean)) {
      next[stage.key] = answers;
    }
  }
  return Object.keys(next).length ? next : null;
}

function serializeGuidedIntake(
  guidedIntake: BusinessProfileGuidedIntake | null | undefined,
) {
  return JSON.stringify(normalizeGuidedIntake(guidedIntake) ?? {});
}

function buildGuidedIntakeContextBlock(
  guidedIntake: BusinessProfileGuidedIntake | null | undefined,
) {
  const sections = BUSINESS_PROFILE_PATH_STAGES.flatMap((stage) => {
    const answers = (guidedIntake?.[stage.key] ?? [])
      .map((answer) => normalizeWhitespace(answer))
      .filter(Boolean);
    if (!answers.length) return [] as string[];
    const body = stage.questions
      .map((question, index) => {
        const answer = answers[index] || "";
        if (!answer) return "";
        return `${index + 1}. ${question}\n${answer}`;
      })
      .filter(Boolean)
      .join("\n\n");
    return body ? [`${stage.label}\n${body}`] : [];
  });

  if (!sections.length) return "";

  return [
    GUIDED_INTAKE_START,
    "Guided intake answers",
    ...sections,
    GUIDED_INTAKE_END,
  ].join("\n\n");
}

function buildSubmissionBusinessContext(
  baseContext: string,
  guidedIntake: BusinessProfileGuidedIntake | null | undefined,
) {
  const base = stripGuidedIntakeContext(baseContext);
  const guidedBlock = buildGuidedIntakeContextBlock(guidedIntake);
  return [base, guidedBlock].filter(Boolean).join("\n\n");
}

function friendlySpeechError(event: SpeechRecognitionErrorEventLike) {
  const code = String(event.error || "")
    .trim()
    .toLowerCase();
  if (code === "not-allowed" || code === "service-not-allowed")
    return "Microphone permission was denied.";
  if (code === "no-speech")
    return "No speech was detected. Try again and speak a little closer to the mic.";
  if (code === "audio-capture")
    return "This browser could not access a working microphone.";
  if (code === "network")
    return "Speech recognition hit a network issue. Try again.";
  return "Speech recognition stopped unexpectedly.";
}

function normalizeGoals(goals: unknown) {
  if (!Array.isArray(goals)) return [] as string[];
  const out: string[] = [];
  for (const g of goals) {
    if (typeof g !== "string") continue;
    const v = g.trim();
    if (!v) continue;
    if (out.includes(v)) continue;
    out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

function safeColorValue(value: string, fallback: string) {
  const v = String(value || "").trim();
  return HEX_RE.test(v) ? v : fallback;
}

function buildProfileDraftPayloadFromSource(
  source?: Partial<BusinessProfile> | BusinessProfileDraft | null,
) {
  return {
    businessName: String(source?.businessName || "").trim(),
    websiteUrl: String(source?.websiteUrl || "").trim(),
    industry: String(source?.industry || "").trim(),
    businessModel: String(source?.businessModel || "").trim(),
    primaryGoals: normalizeGoals(source?.primaryGoals),
    targetCustomer: String(source?.targetCustomer || "").trim(),
    brandVoice: String(source?.brandVoice || "").trim(),
    businessContext: stripGuidedIntakeContext(
      String(source?.businessContext || ""),
    ),
    logoUrl: String(source?.logoUrl || "").trim(),
    brandPrimaryHex: String(source?.brandPrimaryHex || "").trim(),
    brandSecondaryHex: String(source?.brandSecondaryHex || "").trim(),
    brandAccentHex: String(source?.brandAccentHex || "").trim(),
    brandTextHex: String(source?.brandTextHex || "").trim(),
    brandFontFamily: String(source?.brandFontFamily || "").trim(),
    brandFontGoogleFamily: String(source?.brandFontGoogleFamily || "").trim(),
    hostedTheme: {
      bgHex: String(source?.hostedTheme?.bgHex || "").trim(),
      surfaceHex: String(source?.hostedTheme?.surfaceHex || "").trim(),
      softHex: String(source?.hostedTheme?.softHex || "").trim(),
      borderHex: String(source?.hostedTheme?.borderHex || "").trim(),
      textHex: String(source?.hostedTheme?.textHex || "").trim(),
      mutedTextHex: String(source?.hostedTheme?.mutedTextHex || "").trim(),
      primaryHex: String(source?.hostedTheme?.primaryHex || "").trim(),
      accentHex: String(source?.hostedTheme?.accentHex || "").trim(),
      linkHex: String(source?.hostedTheme?.linkHex || "").trim(),
    },
  };
}

function serializeProfileDraftPayload(
  payload: ReturnType<typeof buildProfileDraftPayloadFromSource>,
) {
  return JSON.stringify(payload);
}

function joinGuidedStageAnswers(answers: string[] | undefined) {
  if (!Array.isArray(answers)) return "";
  return answers
    .map((answer) => normalizeWhitespace(answer))
    .filter(Boolean)
    .join("\n\n");
}

export function BusinessProfileForm({
  title,
  description,
  embedded,
  readOnly,
  onSaved,
}: {
  title?: string;
  description?: string;
  embedded?: boolean;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedSigRef = useRef<string>("{}");
  const lastSavedGuidedIntakeSigRef = useRef<string>("{}");

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [primaryGoals, setPrimaryGoals] = useState<string[]>([]);
  const [primaryGoalDraft, setPrimaryGoalDraft] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [clarifying, setClarifying] = useState(false);
  const [clarification, setClarification] = useState<ApiClarify | null>(null);
  const [briefing, setBriefing] = useState<BusinessProfileBriefing | null>(
    null,
  );
  const [guidedIntake, setGuidedIntake] =
    useState<BusinessProfileGuidedIntake | null>(null);
  const [briefUploadBusy, setBriefUploadBusy] = useState(false);
  const [briefTextDraft, setBriefTextDraft] = useState("");
  const [showBriefImporter, setShowBriefImporter] = useState(false);
  const [activeBriefStageIndex, setActiveBriefStageIndex] = useState(0);
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [polishBusyKey, setPolishBusyKey] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationBaseRef = useRef("");
  const dictationStageKeyRef = useRef<BusinessProfilePathStageKey | null>(null);
  const dictationQuestionIndexRef = useRef<number>(0);
  const dictationLatestValueRef = useRef("");
  const businessNameRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const logoActionRef = useRef<HTMLButtonElement | null>(null);
  const targetCustomerRef = useRef<HTMLInputElement | null>(null);
  const brandVoiceRef = useRef<HTMLInputElement | null>(null);
  const activeBriefTextareaRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  const [logoUrl, setLogoUrl] = useState("");
  const [brandPrimaryHex, setBrandPrimaryHex] = useState("");
  const [brandSecondaryHex, setBrandSecondaryHex] = useState("");
  const [brandAccentHex, setBrandAccentHex] = useState("");
  const [brandTextHex, setBrandTextHex] = useState("");
  const [brandFontFamily, setBrandFontFamily] = useState("");
  const [brandFontGoogleFamily, setBrandFontGoogleFamily] = useState("");

  const [hostedBgHex, setHostedBgHex] = useState("");
  const [hostedSurfaceHex, setHostedSurfaceHex] = useState("");
  const [hostedSoftHex, setHostedSoftHex] = useState("");
  const [hostedBorderHex, setHostedBorderHex] = useState("");
  const [hostedTextHex, setHostedTextHex] = useState("");
  const [hostedMutedTextHex, setHostedMutedTextHex] = useState("");
  const [hostedPrimaryHex, setHostedPrimaryHex] = useState("");
  const [hostedAccentHex, setHostedAccentHex] = useState("");
  const [hostedLinkHex, setHostedLinkHex] = useState("");

  const [logoBusy, setLogoBusy] = useState(false);
  const [logoDragActive, setLogoDragActive] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/portal/business-profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as Partial<ApiGet> & {
          error?: string;
        };

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setError(json.error ?? "Unable to load business profile");
          return;
        }

        const savedProfile = json.profile ?? null;
        const draftProfile = json.draftProfile ?? null;
        const hydratedProfile: BusinessProfile | null =
          savedProfile || draftProfile
            ? {
                businessName:
                  draftProfile?.businessName ?? savedProfile?.businessName ?? "",
                websiteUrl:
                  draftProfile?.websiteUrl ?? savedProfile?.websiteUrl ?? null,
                industry:
                  draftProfile?.industry ?? savedProfile?.industry ?? null,
                businessModel:
                  draftProfile?.businessModel ??
                  savedProfile?.businessModel ??
                  null,
                primaryGoals:
                  draftProfile?.primaryGoals ?? savedProfile?.primaryGoals ?? [],
                targetCustomer:
                  draftProfile?.targetCustomer ??
                  savedProfile?.targetCustomer ??
                  null,
                brandVoice:
                  draftProfile?.brandVoice ?? savedProfile?.brandVoice ?? null,
                businessContext:
                  draftProfile?.businessContext ??
                  savedProfile?.businessContext ??
                  null,
                logoUrl: draftProfile?.logoUrl ?? savedProfile?.logoUrl ?? null,
                brandPrimaryHex:
                  draftProfile?.brandPrimaryHex ??
                  savedProfile?.brandPrimaryHex ??
                  null,
                brandSecondaryHex:
                  draftProfile?.brandSecondaryHex ??
                  savedProfile?.brandSecondaryHex ??
                  null,
                brandAccentHex:
                  draftProfile?.brandAccentHex ??
                  savedProfile?.brandAccentHex ??
                  null,
                brandTextHex:
                  draftProfile?.brandTextHex ??
                  savedProfile?.brandTextHex ??
                  null,
                brandFontFamily:
                  draftProfile?.brandFontFamily ??
                  savedProfile?.brandFontFamily ??
                  null,
                brandFontGoogleFamily:
                  draftProfile?.brandFontGoogleFamily ??
                  savedProfile?.brandFontGoogleFamily ??
                  null,
                ...(savedProfile?.hostedTheme || draftProfile?.hostedTheme
                  ? {
                      hostedTheme: {
                        version: 1,
                        bgHex:
                          draftProfile?.hostedTheme?.bgHex ??
                          savedProfile?.hostedTheme?.bgHex ??
                          null,
                        surfaceHex:
                          draftProfile?.hostedTheme?.surfaceHex ??
                          savedProfile?.hostedTheme?.surfaceHex ??
                          null,
                        softHex:
                          draftProfile?.hostedTheme?.softHex ??
                          savedProfile?.hostedTheme?.softHex ??
                          null,
                        borderHex:
                          draftProfile?.hostedTheme?.borderHex ??
                          savedProfile?.hostedTheme?.borderHex ??
                          null,
                        textHex:
                          draftProfile?.hostedTheme?.textHex ??
                          savedProfile?.hostedTheme?.textHex ??
                          null,
                        mutedTextHex:
                          draftProfile?.hostedTheme?.mutedTextHex ??
                          savedProfile?.hostedTheme?.mutedTextHex ??
                          null,
                        primaryHex:
                          draftProfile?.hostedTheme?.primaryHex ??
                          savedProfile?.hostedTheme?.primaryHex ??
                          null,
                        accentHex:
                          draftProfile?.hostedTheme?.accentHex ??
                          savedProfile?.hostedTheme?.accentHex ??
                          null,
                        linkHex:
                          draftProfile?.hostedTheme?.linkHex ??
                          savedProfile?.hostedTheme?.linkHex ??
                          null,
                      },
                    }
                  : {}),
              }
            : null;

        applyProfileToForm(hydratedProfile, {
          savedProfile,
          markSaved: !draftProfile,
        });
        setClarification(json.clarification ?? null);
        setBriefing(json.briefing ?? null);
        setGuidedIntake(normalizeGuidedIntake(json.guidedIntake ?? null));
        lastSavedGuidedIntakeSigRef.current = serializeGuidedIntake(
          json.guidedIntake ?? null,
        );
      } catch (loadError) {
        if (cancelled || controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message || "Unable to load business profile"
            : "Unable to load business profile",
        );
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const brandFontPresetKeyRaw = useMemo(
    () =>
      fontPresetKeyFromStyle({
        fontFamily: brandFontFamily,
        fontGoogleFamily: brandFontGoogleFamily,
      }),
    [brandFontFamily, brandFontGoogleFamily],
  );

  const brandFontPresetKey =
    brandFontPresetKeyRaw === "custom" ? "default" : brandFontPresetKeyRaw;

  const visibleGuidedContext = useMemo(
    () =>
      BUSINESS_PROFILE_PATH_STAGES.filter(
        (stage) => stage.key !== "businessBasics",
      )
        .map((stage) => joinGuidedStageAnswers(guidedIntake?.[stage.key]))
        .filter(Boolean)
        .join("\n\n"),
    [guidedIntake],
  );

  const filledGuidedStageCount = useMemo(
    () =>
      BUSINESS_PROFILE_PATH_STAGES.filter(
        (stage) =>
          stage.key !== "businessBasics" &&
          joinGuidedStageAnswers(guidedIntake?.[stage.key]).length > 0,
      ).length,
    [guidedIntake],
  );

  const canSave = useMemo(
    () => !readOnly && businessName.trim().length >= 2,
    [businessName, readOnly],
  );
  const contextHealth = useMemo(
    () =>
      assessBusinessProfileContextHealth({
        businessName,
        websiteUrl,
        industry,
        businessModel,
        primaryGoals,
        targetCustomer,
        brandVoice,
        businessContext: visibleGuidedContext,
        guidedStageCount: filledGuidedStageCount,
        logoUrl,
        brandPrimaryHex,
        brandSecondaryHex,
        brandAccentHex,
        brandTextHex,
        brandFontFamily,
        brandFontGoogleFamily,
      }),
    [
      businessName,
      websiteUrl,
      industry,
      businessModel,
      primaryGoals,
      targetCustomer,
      brandVoice,
      visibleGuidedContext,
      filledGuidedStageCount,
      logoUrl,
      brandPrimaryHex,
      brandSecondaryHex,
      brandAccentHex,
      brandTextHex,
      brandFontFamily,
      brandFontGoogleFamily,
    ],
  );

  const visibleBriefStages = useMemo(
    () =>
      BUSINESS_PROFILE_PATH_STAGES.filter(
        (stage) => stage.key !== "businessBasics",
      ),
    [],
  );

  const autoFilledVisibleStageCount = useMemo(
    () =>
      visibleBriefStages.filter(
        (stage) => joinGuidedStageAnswers(guidedIntake?.[stage.key]).length > 0,
      ).length,
    [guidedIntake, visibleBriefStages],
  );

  const contextStageReadiness = useMemo(
    () =>
      buildBusinessProfilePathProgress({
        hasBusinessName: Boolean(String(businessName || "").trim()),
        hasWebsiteUrl: Boolean(String(websiteUrl || "").trim()),
        hasIndustry: Boolean(String(industry || "").trim()),
        hasBusinessModel: Boolean(String(businessModel || "").trim()),
        signals: contextHealth.signals,
      }).filter((stage) => stage.key !== "businessBasics"),
    [
      businessModel,
      businessName,
      contextHealth.signals,
      industry,
      websiteUrl,
    ],
  );

  const readyContextStageCount = contextStageReadiness.filter(
    (stage) => stage.complete,
  ).length;
  const missingContextStageCount = Math.max(
    contextStageReadiness.length - readyContextStageCount,
    0,
  );
  const contextProfileComplete =
    contextStageReadiness.length > 0 && missingContextStageCount === 0;

  useEffect(() => {
    setActiveBriefStageIndex((current) => {
      if (!visibleBriefStages.length) return 0;
      return Math.min(current, visibleBriefStages.length - 1);
    });
  }, [visibleBriefStages.length]);

  const activeBriefStage =
    visibleBriefStages[activeBriefStageIndex] ?? visibleBriefStages[0] ?? null;
  const activeBriefStageText = activeBriefStage
    ? joinGuidedStageAnswers(guidedIntake?.[activeBriefStage.key])
    : "";
  const activeBriefStageAnswers = activeBriefStage
    ? getGuidedStageAnswers(activeBriefStage.key)
    : [];
  const activeBriefStageAnsweredCount = activeBriefStageAnswers.filter(Boolean)
    .length;
  const previousBriefStage =
    activeBriefStageIndex > 0
      ? visibleBriefStages[activeBriefStageIndex - 1] ?? null
      : null;
  const nextBriefStage =
    activeBriefStageIndex < visibleBriefStages.length - 1
      ? visibleBriefStages[activeBriefStageIndex + 1] ?? null
      : null;

  const currentSig = useMemo(
    () =>
      serializeProfileDraftPayload({
        businessName: String(businessName || "").trim(),
        websiteUrl: String(websiteUrl || "").trim(),
        industry: String(industry || "").trim(),
        businessModel: String(businessModel || "").trim(),
        primaryGoals: normalizeGoals(primaryGoals),
        targetCustomer: String(targetCustomer || "").trim(),
        brandVoice: String(brandVoice || "").trim(),
        businessContext: stripGuidedIntakeContext(businessContext),
        logoUrl: String(logoUrl || "").trim(),
        brandPrimaryHex: String(brandPrimaryHex || "").trim(),
        brandSecondaryHex: String(brandSecondaryHex || "").trim(),
        brandAccentHex: String(brandAccentHex || "").trim(),
        brandTextHex: String(brandTextHex || "").trim(),
        brandFontFamily: String(brandFontFamily || "").trim(),
        brandFontGoogleFamily: String(brandFontGoogleFamily || "").trim(),
        hostedTheme: {
          bgHex: String(hostedBgHex || "").trim(),
          surfaceHex: String(hostedSurfaceHex || "").trim(),
          softHex: String(hostedSoftHex || "").trim(),
          borderHex: String(hostedBorderHex || "").trim(),
          textHex: String(hostedTextHex || "").trim(),
          mutedTextHex: String(hostedMutedTextHex || "").trim(),
          primaryHex: String(hostedPrimaryHex || "").trim(),
          accentHex: String(hostedAccentHex || "").trim(),
          linkHex: String(hostedLinkHex || "").trim(),
        },
      }),
    [
      businessName,
      websiteUrl,
      industry,
      businessModel,
      primaryGoals,
      targetCustomer,
      brandVoice,
      businessContext,
      logoUrl,
      brandPrimaryHex,
      brandSecondaryHex,
      brandAccentHex,
      brandTextHex,
      brandFontFamily,
      brandFontGoogleFamily,
      hostedBgHex,
      hostedSurfaceHex,
      hostedSoftHex,
      hostedBorderHex,
      hostedTextHex,
      hostedMutedTextHex,
      hostedPrimaryHex,
      hostedAccentHex,
      hostedLinkHex,
    ],
  );

  const clarificationSourceSignature = useMemo(
    () =>
      JSON.stringify({
        businessName: String(businessName || "").trim(),
        websiteUrl: String(websiteUrl || "").trim(),
        industry: String(industry || "").trim(),
        businessModel: String(businessModel || "").trim(),
        primaryGoals: normalizeGoals(primaryGoals),
        targetCustomer: String(targetCustomer || "").trim(),
        brandVoice: String(brandVoice || "").trim(),
        businessContext: buildSubmissionBusinessContext(
          businessContext,
          guidedIntake,
        ),
      }),
    [
      businessName,
      websiteUrl,
      industry,
      businessModel,
      primaryGoals,
      targetCustomer,
      brandVoice,
      businessContext,
      guidedIntake,
    ],
  );

  const guidedIntakeSig = useMemo(
    () => serializeGuidedIntake(guidedIntake),
    [guidedIntake],
  );
  const dirty =
    currentSig !== lastSavedSigRef.current ||
    guidedIntakeSig !== lastSavedGuidedIntakeSigRef.current;

  function applyProfileToForm(
    profile: BusinessProfile | null | undefined,
    options?: { savedProfile?: BusinessProfile | null; markSaved?: boolean },
  ) {
    if (!profile) {
      setBusinessContext("");
      lastSavedSigRef.current =
        options?.markSaved === false && options.savedProfile
          ? serializeProfileDraftPayload(
              buildProfileDraftPayloadFromSource(options.savedProfile),
            )
          : "{}";
      return;
    }

    const nextBusinessName = profile.businessName ?? "";
    const nextWebsiteUrl = profile.websiteUrl ?? "";
    const nextIndustry = profile.industry ?? "";
    const nextBusinessModel = profile.businessModel ?? "";
    const nextPrimaryGoals = normalizeGoals(profile.primaryGoals);
    const nextTargetCustomer = profile.targetCustomer ?? "";
    const nextBrandVoice = profile.brandVoice ?? "";
    const nextBusinessContext = stripGuidedIntakeContext(
      profile.businessContext ?? "",
    );

    const nextLogoUrl = profile.logoUrl ?? "";
    const nextBrandPrimaryHex = profile.brandPrimaryHex ?? "";
    const nextBrandSecondaryHex = profile.brandSecondaryHex ?? "";
    const nextBrandAccentHex = profile.brandAccentHex ?? "";
    const nextBrandTextHex = profile.brandTextHex ?? "";

    const nextBrandFontFamily = profile.brandFontFamily ?? "";
    const nextBrandFontGoogleFamily = profile.brandFontGoogleFamily ?? "";

    const hosted = profile.hostedTheme;
    const nextHostedBgHex = hosted?.bgHex ?? "";
    const nextHostedSurfaceHex = hosted?.surfaceHex ?? "";
    const nextHostedSoftHex = hosted?.softHex ?? "";
    const nextHostedBorderHex = hosted?.borderHex ?? "";
    const nextHostedTextHex = hosted?.textHex ?? "";
    const nextHostedMutedTextHex = hosted?.mutedTextHex ?? "";
    const nextHostedPrimaryHex = hosted?.primaryHex ?? "";
    const nextHostedAccentHex = hosted?.accentHex ?? "";
    const nextHostedLinkHex = hosted?.linkHex ?? "";

    setBusinessName(nextBusinessName);
    setWebsiteUrl(nextWebsiteUrl);
    setIndustry(nextIndustry);
    setBusinessModel(nextBusinessModel);
    setPrimaryGoals(nextPrimaryGoals);
    setTargetCustomer(nextTargetCustomer);
    setBrandVoice(nextBrandVoice);
    setBusinessContext(nextBusinessContext);

    setLogoUrl(nextLogoUrl);
    setBrandPrimaryHex(nextBrandPrimaryHex);
    setBrandSecondaryHex(nextBrandSecondaryHex);
    setBrandAccentHex(nextBrandAccentHex);
    setBrandTextHex(nextBrandTextHex);

    setBrandFontFamily(nextBrandFontFamily);
    setBrandFontGoogleFamily(nextBrandFontGoogleFamily);

    setHostedBgHex(nextHostedBgHex);
    setHostedSurfaceHex(nextHostedSurfaceHex);
    setHostedSoftHex(nextHostedSoftHex);
    setHostedBorderHex(nextHostedBorderHex);
    setHostedTextHex(nextHostedTextHex);
    setHostedMutedTextHex(nextHostedMutedTextHex);
    setHostedPrimaryHex(nextHostedPrimaryHex);
    setHostedAccentHex(nextHostedAccentHex);
    setHostedLinkHex(nextHostedLinkHex);

    lastSavedSigRef.current =
      options?.markSaved === false && options.savedProfile
        ? serializeProfileDraftPayload(
            buildProfileDraftPayloadFromSource(options.savedProfile),
          )
        : serializeProfileDraftPayload(
            buildProfileDraftPayloadFromSource({
              businessName: nextBusinessName,
              websiteUrl: nextWebsiteUrl,
              industry: nextIndustry,
              businessModel: nextBusinessModel,
              primaryGoals: nextPrimaryGoals,
              targetCustomer: nextTargetCustomer,
              brandVoice: nextBrandVoice,
              businessContext: nextBusinessContext,
              logoUrl: nextLogoUrl,
              brandPrimaryHex: nextBrandPrimaryHex,
              brandSecondaryHex: nextBrandSecondaryHex,
              brandAccentHex: nextBrandAccentHex,
              brandTextHex: nextBrandTextHex,
              brandFontFamily: nextBrandFontFamily,
              brandFontGoogleFamily: nextBrandFontGoogleFamily,
              hostedTheme: {
                bgHex: nextHostedBgHex,
                surfaceHex: nextHostedSurfaceHex,
                softHex: nextHostedSoftHex,
                borderHex: nextHostedBorderHex,
                textHex: nextHostedTextHex,
                mutedTextHex: nextHostedMutedTextHex,
                primaryHex: nextHostedPrimaryHex,
                accentHex: nextHostedAccentHex,
                linkHex: nextHostedLinkHex,
              },
            }),
          );
  }

  function focusField(
    element: HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null,
  ) {
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus();
  }

  async function persistWorkspacePatch(patch: {
    draftProfile?: ReturnType<typeof buildProfileDraftPayload>;
    briefing?: BusinessProfileBriefing | null;
    guidedIntake?: BusinessProfileGuidedIntake | null;
  }) {
    const res = await fetch("/api/portal/business-profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      setError(
        (json as { error?: string })?.error ??
          "Unable to persist the workspace draft",
      );
      return false;
    }
    return true;
  }

  function getGuidedStageAnswers(
    stageKey: BusinessProfilePathStageKey,
    source = guidedIntake,
  ) {
    const current = normalizeGuidedIntake(source ?? null) ?? {};
    const questionCount =
      BUSINESS_PROFILE_PATH_STAGE_BY_KEY[stageKey].questions.length;
    const rawAnswers = Array.isArray(current[stageKey]) ? current[stageKey] ?? [] : [];
    return Array.from({ length: questionCount }, (_, index) =>
      normalizeWhitespace(String(rawAnswers[index] || "")).slice(0, 2000),
    );
  }

  function buildNextGuidedStageText(
    stageKey: BusinessProfilePathStageKey,
    value: string,
    source = guidedIntake,
    questionIndex = 0,
  ) {
    const current = normalizeGuidedIntake(source ?? null) ?? {};
    const questionCount = BUSINESS_PROFILE_PATH_STAGE_BY_KEY[stageKey].questions.length;
    const nextStageAnswers = getGuidedStageAnswers(stageKey, current);
    const safeQuestionIndex = Math.max(0, Math.min(questionCount - 1, questionIndex));
    nextStageAnswers[safeQuestionIndex] = normalizeWhitespace(value).slice(0, 2000);
    return normalizeGuidedIntake({
      ...current,
      [stageKey]: nextStageAnswers,
    });
  }

  function updateGuidedStageText(
    stageKey: BusinessProfilePathStageKey,
    value: string,
    questionIndex = 0,
  ) {
    setGuidedIntake((current) =>
      buildNextGuidedStageText(stageKey, value, current, questionIndex),
    );
  }

  async function persistGuidedStageText(
    stageKey: BusinessProfilePathStageKey,
    value: string,
    questionIndex = 0,
  ) {
    if (readOnly) return;
    const nextGuidedIntake = buildNextGuidedStageText(
      stageKey,
      value,
      guidedIntake,
      questionIndex,
    );
    setGuidedIntake(nextGuidedIntake);
    await persistWorkspacePatch({ guidedIntake: nextGuidedIntake });
  }

  async function appendToActiveBriefStage(value: string) {
    if (readOnly || !activeBriefStage) return;
    const nextValue = appendUniqueBlock(activeBriefStageAnswers[0] || "", value);
    const nextGuidedIntake = buildNextGuidedStageText(
      activeBriefStage.key,
      nextValue,
      guidedIntake,
      0,
    );
    setGuidedIntake(nextGuidedIntake);
    await persistWorkspacePatch({ guidedIntake: nextGuidedIntake });
  }

  function applyBriefingToDirectFields(nextBriefing: BusinessProfileBriefing) {
    const nextDraft = buildProfileDraftPayload();
    let changed = false;

    for (const stage of nextBriefing.stages) {
      for (const suggestion of stage.suggestions) {
        if (
          suggestion.field === "businessName" &&
          typeof suggestion.value === "string" &&
          !nextDraft.businessName.trim()
        ) {
          setBusinessName(suggestion.value);
          nextDraft.businessName = suggestion.value;
          changed = true;
        } else if (
          suggestion.field === "websiteUrl" &&
          typeof suggestion.value === "string" &&
          !nextDraft.websiteUrl.trim()
        ) {
          setWebsiteUrl(suggestion.value);
          nextDraft.websiteUrl = suggestion.value;
          changed = true;
        } else if (
          suggestion.field === "industry" &&
          typeof suggestion.value === "string" &&
          !nextDraft.industry.trim()
        ) {
          setIndustry(suggestion.value);
          nextDraft.industry = suggestion.value;
          changed = true;
        } else if (
          suggestion.field === "businessModel" &&
          typeof suggestion.value === "string" &&
          !nextDraft.businessModel.trim()
        ) {
          setBusinessModel(suggestion.value);
          nextDraft.businessModel = suggestion.value;
          changed = true;
        } else if (
          suggestion.field === "primaryGoals" &&
          !nextDraft.primaryGoals?.length
        ) {
          const nextGoals = Array.isArray(suggestion.value)
            ? suggestion.value
            : String(suggestion.value || "")
                .split(/[\n,;]+/)
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 10);
          if (nextGoals.length) {
            setPrimaryGoals(nextGoals);
            nextDraft.primaryGoals = nextGoals;
            changed = true;
          }
        } else if (
          suggestion.field === "targetCustomer" &&
          typeof suggestion.value === "string" &&
          !nextDraft.targetCustomer.trim()
        ) {
          setTargetCustomer(suggestion.value);
          nextDraft.targetCustomer = suggestion.value;
          changed = true;
        } else if (
          suggestion.field === "brandVoice" &&
          typeof suggestion.value === "string" &&
          !nextDraft.brandVoice.trim()
        ) {
          setBrandVoice(suggestion.value);
          nextDraft.brandVoice = suggestion.value;
          changed = true;
        }
      }
    }

    return changed ? nextDraft : null;
  }

  async function runBriefExtraction(file?: File | null) {
    if (readOnly || briefUploadBusy) return;
    if (!file && !briefTextDraft.trim()) {
      setError("Upload a brief file or paste a brief first.");
      return;
    }
    setBriefUploadBusy(true);
    setError(null);

    const formData = new FormData();
    if (file) formData.set("briefFile", file);
    if (briefTextDraft.trim()) formData.set("briefText", briefTextDraft.trim());

    const res = await fetch("/api/portal/business-profile/brief", {
      method: "POST",
      body: formData,
    });
    const json = (await res.json().catch(() => ({}))) as ApiBriefExtract;
    setBriefUploadBusy(false);

    if (!res.ok || !json.ok || !json.briefing) {
      setError(json.error ?? "Unable to extract the uploaded brief");
      return;
    }

    setBriefing(json.briefing);
    setGuidedIntake(
      normalizeGuidedIntake(
        json.guidedIntake ??
          buildBusinessProfileGuidedIntakeFromBriefing(
            json.briefing,
            null,
          ),
      ),
    );
    setShowBriefImporter(false);
    setBriefTextDraft("");
    const nextDraft = applyBriefingToDirectFields(json.briefing);
    if (nextDraft) {
      await persistWorkspacePatch({ draftProfile: nextDraft });
    }
    toast.success("Business document extracted into the form.");
  }

  async function clearBriefing() {
    if (readOnly) return;
    setBriefing(null);
    setShowBriefImporter(false);
    await persistWorkspacePatch({ briefing: null });
  }

  function handleNextStepClick(step: BusinessProfileContextNextStep) {
    if (readOnly) return;

    if (step.target === "logo") {
      focusField(logoActionRef.current);
      return;
    }

    if (step.target === "targetCustomer") {
      focusField(targetCustomerRef.current);
      return;
    }

    if (step.target === "brandVoice") {
      focusField(brandVoiceRef.current);
      return;
    }

    focusField(activeBriefTextareaRefs.current[0] ?? null);
  }

  function focusActiveBriefAnswer(questionIndex = 0) {
    focusField(activeBriefTextareaRefs.current[questionIndex] ?? null);
  }

  function moveToBriefStage(nextIndex: number) {
    if (!visibleBriefStages.length) return;
    const safeIndex = Math.max(0, Math.min(visibleBriefStages.length - 1, nextIndex));
    setActiveBriefStageIndex(safeIndex);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        focusActiveBriefAnswer(0);
      }, 0);
    }
  }

  function handleContextStageClick(stageKey: BusinessProfilePathStageKey) {
    const nextIndex = visibleBriefStages.findIndex((stage) => stage.key === stageKey);
    if (nextIndex < 0) return;
    moveToBriefStage(nextIndex);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDictationSupported(Boolean(getSpeechRecognitionCtor(window)));

    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, []);

  function buildClarifyPayload() {
    const payload: Record<string, unknown> = {};
    const assign = (
      key: string,
      value: string,
      opts?: { minLength?: number },
    ) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return;
      if ((opts?.minLength ?? 1) > trimmed.length) return;
      payload[key] = trimmed;
    };

    assign("businessName", businessName, { minLength: 2 });
    assign("websiteUrl", websiteUrl);
    assign("industry", industry);
    assign("businessModel", businessModel);
    assign("targetCustomer", targetCustomer);
    assign("brandVoice", brandVoice);
    assign(
      "businessContext",
      buildSubmissionBusinessContext(businessContext, guidedIntake),
    );

    const goals = (primaryGoals || [])
      .map((goal) => String(goal || "").trim())
      .filter(Boolean)
      .slice(0, 10);
    if (goals.length) payload.primaryGoals = goals;

    return payload;
  }

  function buildProfileDraftPayload() {
    return {
      businessName,
      websiteUrl,
      industry,
      businessModel,
      primaryGoals: primaryGoals.length ? primaryGoals : undefined,
      targetCustomer,
      brandVoice,
      businessContext: stripGuidedIntakeContext(businessContext),
      logoUrl,
      brandPrimaryHex,
      brandSecondaryHex,
      brandAccentHex,
      brandTextHex,
      brandFontFamily,
      brandFontGoogleFamily,
      hostedTheme: {
        bgHex: hostedBgHex,
        surfaceHex: hostedSurfaceHex,
        softHex: hostedSoftHex,
        borderHex: hostedBorderHex,
        textHex: hostedTextHex,
        mutedTextHex: hostedMutedTextHex,
        primaryHex: hostedPrimaryHex,
        accentHex: hostedAccentHex,
        linkHex: hostedLinkHex,
      },
    };
  }

  async function persistLogoSelection(
    nextLogoUrl: string,
    successMessage: string,
  ) {
    const normalizedUrl = String(nextLogoUrl || "").trim();
    if (!normalizedUrl) {
      setError("The logo upload did not return a usable image URL.");
      return false;
    }

    setLogoUrl(normalizedUrl);
    const nextDraft = {
      ...buildProfileDraftPayload(),
      logoUrl: normalizedUrl,
    };
    const persisted = await persistWorkspacePatch({ draftProfile: nextDraft });
    if (!persisted) return false;
    toast.success(successMessage);
    return true;
  }

  async function uploadLogoFile(file: File | null | undefined) {
    if (readOnly || logoBusy || !file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setError("Upload an image file for the logo.");
      return;
    }

    setLogoBusy(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("files", file);
      const up = await fetch("/api/portal/media/items", {
        method: "POST",
        body: fd,
      });
      const upBody = (await up.json().catch(() => ({}))) as ApiMediaUpload;
      const firstItem = Array.isArray(upBody.items) ? upBody.items[0] : null;
      const nextLogoUrl = String(
        firstItem?.previewUrl || firstItem?.shareUrl || "",
      ).trim();

      if (!up.ok || upBody.ok !== true || !nextLogoUrl) {
        setError(upBody.error ?? "Upload failed");
        return;
      }

      await persistLogoSelection(nextLogoUrl, "Logo uploaded.");
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
    }
  }

  async function runClarification() {
    if (readOnly || clarifying) return;
    setClarifying(true);
    setError(null);

    const res = await fetch("/api/portal/business-profile/clarify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildProfileDraftPayload(),
        ...buildClarifyPayload(),
      }),
    });

    const json = (await res.json().catch(() => ({}))) as Partial<ApiClarify> & {
      error?: string;
    };
    setClarifying(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to run clarification");
      return;
    }

    setClarification({
      ok: true,
      summary: String(json.summary || "").trim(),
      questions: Array.isArray(json.questions) ? json.questions : [],
      recommendedContext: String(json.recommendedContext || "").trim(),
      sourceSignature: String(json.sourceSignature || "").trim(),
      generatedAt: String(json.generatedAt || "").trim(),
    });
  }

  async function polishGuidedStageText(
    stageKey: BusinessProfilePathStageKey,
    questionIndex = 0,
  ) {
    if (readOnly || polishBusyKey) return;

    const answer = getGuidedStageAnswers(stageKey)[questionIndex] || "";
    if (!normalizeWhitespace(answer)) {
      toast.error("Add or dictate some notes before using AI polish.");
      return;
    }

    const busyKey = buildGuidedAnswerKey(stageKey, questionIndex);
    setPolishBusyKey(busyKey);
    setError(null);

    try {
      const res = await fetch("/api/portal/business-profile/polish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...buildProfileDraftPayload(),
          guidedIntake,
          stageKey,
          questionIndex,
          text: answer,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as ApiPolish;
      if (!res.ok || !json.ok || typeof json.polished !== "string") {
        throw new Error(json.error || "Unable to polish this answer");
      }

      const polished = normalizeWhitespace(json.polished);
      if (!polished) {
        throw new Error("AI polish returned an empty answer");
      }

      await persistGuidedStageText(stageKey, polished, questionIndex);
      toast.success("Answer polished.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to polish this answer";
      setError(message);
    } finally {
      setPolishBusyKey(null);
    }
  }

  function stopDictation() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }

  function startDictation(stageKey: BusinessProfilePathStageKey, questionIndex = 0) {
    if (readOnly) return;
    if (dictating) {
      stopDictation();
      return;
    }

    if (typeof window === "undefined") {
      setDictationError("Speech-to-text is only available in the browser.");
      return;
    }

    const Recognition = getSpeechRecognitionCtor(window);
    if (!Recognition) {
      setDictationError(
        "This browser does not support built-in speech-to-text.",
      );
      return;
    }

    setDictationError(null);

    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    focusActiveBriefAnswer(questionIndex);
    const stageBase = getGuidedStageAnswers(stageKey)[questionIndex] || "";
    dictationStageKeyRef.current = stageKey;
    dictationQuestionIndexRef.current = questionIndex;
    dictationBaseRef.current = stageBase.trim()
      ? `${stageBase.trimEnd()}\n\n`
      : "";
    dictationLatestValueRef.current = stageBase.trimEnd();
    recognition.onresult = (event) => {
      const segments: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative?.transcript) continue;
        segments.push(alternative.transcript);
      }

      const transcript = segments.join(" ").replace(/\s+/g, " ").trim();
      const nextValue = transcript
        ? `${dictationBaseRef.current}${transcript}`
        : dictationBaseRef.current.trimEnd();
      const normalizedValue = nextValue.trimEnd();
      dictationLatestValueRef.current = normalizedValue;
      setGuidedIntake((current) =>
        buildNextGuidedStageText(stageKey, normalizedValue, current, questionIndex),
      );
    };
    recognition.onerror = (event) => {
      setDictationError(friendlySpeechError(event));
      setDictating(false);
      recognitionRef.current = null;
      dictationStageKeyRef.current = null;
      dictationQuestionIndexRef.current = 0;
    };
    recognition.onend = () => {
      const currentStageKey = dictationStageKeyRef.current;
      const currentQuestionIndex = dictationQuestionIndexRef.current;
      const latestValue = dictationLatestValueRef.current;
      setDictating(false);
      recognitionRef.current = null;
      dictationStageKeyRef.current = null;
      dictationQuestionIndexRef.current = 0;
      if (currentStageKey) {
        void persistGuidedStageText(
          currentStageKey,
          latestValue,
          currentQuestionIndex,
        );
      }
    };

    recognitionRef.current = recognition;
    setDictating(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setDictating(false);
      setDictationError(
        "Speech-to-text could not start in this browser session.",
      );
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const fontFamilyToSave =
      brandFontPresetKeyRaw === "custom" ? "" : brandFontFamily;
    const fontGoogleFamilyToSave =
      brandFontPresetKeyRaw === "custom" ? "" : brandFontGoogleFamily;

    const payload = {
      ...buildProfileDraftPayload(),
      businessContext: buildSubmissionBusinessContext(
        businessContext,
        guidedIntake,
      ),
    };

    const res = await fetch("/api/portal/business-profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        brandFontFamily: fontFamilyToSave,
        brandFontGoogleFamily: fontGoogleFamilyToSave,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as Partial<ApiPut> & {
      error?: string;
    };
    setSaving(false);

    if (!res.ok || !json.ok) {
      setError(json.error ?? "Unable to save");
      return;
    }

    applyProfileToForm(
      json.profile ? { ...json.profile, businessContext } : null,
    );
    lastSavedGuidedIntakeSigRef.current = serializeGuidedIntake(guidedIntake);

    onSaved?.();
  }

  if (loading) {
    return embedded ? (
      <div className="text-sm text-zinc-600">Loading business profile…</div>
    ) : (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading business profile…
      </div>
    );
  }

  const content = (
    <>
      {!embedded ? (
        <>
          <div className="text-sm font-semibold text-zinc-900">
            {title ?? "Business profile"}
          </div>
          <div className="mt-2 text-sm text-zinc-600">
            {description ??
              "This helps us tailor services and onboarding to your business."}
          </div>
        </>
      ) : null}

      <div
        className={
          (embedded ? "mt-3" : "mt-5") +
          (contextProfileComplete
            ? " rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5"
            : " rounded-3xl border border-[rgba(29,78,216,0.18)] bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(255,255,255,0.98))] p-4 sm:p-5")
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div
              className={[
                "text-xs font-medium",
                contextProfileComplete ? "text-emerald-700" : "text-brand-ink",
              ].join(" ")}
            >
              {contextProfileComplete ? "Profile context ready" : "Complete your profile"}
            </div>
            <div className="mt-2 text-base font-semibold text-zinc-900 sm:text-lg">
              {contextProfileComplete
                ? "Your business context is in good shape."
                : missingContextStageCount === 1
                  ? "One section still needs business detail before this profile feels complete."
                  : `${missingContextStageCount} sections still need business detail before this profile feels complete.`}
            </div>
            <div className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              {contextProfileComplete
                ? "Keep these sections current so onboarding, AI behavior, and downstream service setup stay aligned with the latest business reality."
                : "Fill in the sections below so onboarding, AI behavior, and generated assets have enough real business context to work from. If Pura learns this organically during onboarding, this area can still hydrate automatically."}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {contextStageReadiness.map((stage) => {
                const isActive = activeBriefStage?.key === stage.key;
                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => handleContextStageClick(stage.key)}
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      isActive
                        ? "border-[rgba(29,78,216,0.28)] bg-[rgba(29,78,216,0.08)] text-brand-ink"
                        : stage.complete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <span>{stage.label}</span>
                    <span
                      className={[
                        "inline-flex h-2 w-2 rounded-full",
                        isActive
                          ? "bg-[rgba(29,78,216,0.75)]"
                          : stage.complete
                            ? "bg-emerald-500"
                            : "bg-zinc-300",
                      ].join(" ")}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={[
              "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold lg:pt-1",
              contextProfileComplete
                ? "bg-emerald-100 text-emerald-800"
                : "bg-[rgba(29,78,216,0.08)] text-brand-ink ring-1 ring-inset ring-[rgba(29,78,216,0.12)]",
            ].join(" ")}
          >
            {contextProfileComplete
              ? `All ${contextStageReadiness.length} sections ready`
              : `Ready in ${readyContextStageCount} of ${contextStageReadiness.length} sections`}
          </div>
        </div>

        {contextHealth.nextSteps.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
              {contextHealth.nextSteps.map((step) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => handleNextStepClick(step)}
                  disabled={Boolean(readOnly)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white disabled:opacity-60"
                >
                  {step.label}
                </button>
              ))}
          </div>
        ) : null}
      </div>

      <div
        className={
          (embedded ? "mt-2" : "mt-5") +
          " grid grid-cols-1 gap-4 sm:grid-cols-2"
        }
      >
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Logo</label>
          <div
            className={[
              "mt-2 rounded-3xl border border-dashed p-4 transition-colors sm:p-5",
              logoDragActive
                ? "border-brand-ink bg-[rgba(29,78,216,0.04)]"
                : "border-zinc-200 bg-white",
            ].join(" ")}
            onDragEnter={(e) => {
              if (readOnly) return;
              e.preventDefault();
              setLogoDragActive(true);
            }}
            onDragOver={(e) => {
              if (readOnly) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setLogoDragActive(true);
            }}
            onDragLeave={(e) => {
              if (readOnly) return;
              e.preventDefault();
              setLogoDragActive(false);
            }}
            onDrop={(e) => {
              if (readOnly) return;
              e.preventDefault();
              setLogoDragActive(false);
              const droppedFile =
                Array.from(e.dataTransfer.files || []).find((file) =>
                  String(file.type || "").toLowerCase().startsWith("image/"),
                ) ?? e.dataTransfer.files?.[0];
              if (!droppedFile) {
                setError("Drop an image file for the logo.");
                return;
              }
              void uploadLogoFile(droppedFile);
            }}
          >
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={logoBusy || Boolean(readOnly)}
              onChange={(e) => {
                if (readOnly) return;
                const file = e.target.files?.[0];
                void uploadLogoFile(file);
              }}
            />

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-medium text-zinc-400">
                      Logo
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">
                    {logoUrl ? "Logo ready" : "Drop a logo here or upload one"}
                  </div>
                  <div className="mt-1 truncate text-xs leading-5 text-zinc-500" title={logoUrl || undefined}>
                    {logoUrl
                      ? logoUrl
                      : "PNG, JPG, SVG, or WebP. Uploaded logos also land in your media library."}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  ref={logoActionRef}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                  onClick={() => {
                    if (readOnly || logoBusy) return;
                    logoInputRef.current?.click();
                  }}
                  disabled={logoBusy || Boolean(readOnly)}
                >
                  {logoBusy ? "Uploading…" : "Upload logo"}
                </button>

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                  onClick={() => !readOnly && !logoBusy && setLogoPickerOpen(true)}
                  disabled={logoBusy || Boolean(readOnly)}
                >
                  Choose from media library
                </button>
              </div>
            </div>
          </div>
        </div>

        <PortalMediaPickerModal
          open={logoPickerOpen}
          title="Choose a logo"
          confirmLabel="Use"
          onClose={() => setLogoPickerOpen(false)}
          onPick={(item) => {
            void persistLogoSelection(item.shareUrl, "Logo selected.");
            setLogoPickerOpen(false);
          }}
        />

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">
            Business name
          </label>
          <input
            ref={businessNameRef}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Acme Dental"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">Website</label>
          <input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Industry
          </label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Home services, dental, legal…"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Business model
          </label>
          <input
            value={businessModel}
            onChange={(e) => setBusinessModel(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Appointments, subscriptions, one-time jobs…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">
            Primary goals
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              value={primaryGoalDraft}
              onChange={(e) => setPrimaryGoalDraft(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="Add a goal (e.g. More leads)"
            />
            <button
              type="button"
              disabled={Boolean(readOnly)}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => {
                if (readOnly) return;
                const v = primaryGoalDraft.trim();
                if (!v) return;
                setPrimaryGoals((xs) => {
                  if (xs.includes(v)) return xs;
                  if (xs.length >= 10) return xs;
                  return [...xs, v];
                });
                setPrimaryGoalDraft("");
              }}
            >
              + Add
            </button>
          </div>

          {primaryGoals.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {primaryGoals.map((g) => (
                <button
                  key={g}
                  type="button"
                  disabled={Boolean(readOnly)}
                  onClick={() =>
                    !readOnly &&
                    setPrimaryGoals((xs) => xs.filter((x) => x !== g))
                  }
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-100 disabled:opacity-60"
                  title={readOnly ? undefined : "Remove"}
                >
                  <span className="max-w-[18rem] truncate">{g}</span>
                  {!readOnly ? <span className="text-zinc-500">×</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">
            Target customer
          </label>
          <input
            ref={targetCustomerRef}
            value={targetCustomer}
            onChange={(e) => setTargetCustomer(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Families in Atlanta looking for…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">
            Brand voice
          </label>
          <input
            ref={brandVoiceRef}
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            disabled={Boolean(readOnly)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
            placeholder="Professional, friendly, short paragraphs"
          />
        </div>

        <div className="sm:col-span-2 rounded-3xl border border-zinc-200 bg-zinc-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Business context and operating notes
              </label>
              <div className="mt-1 text-xs text-zinc-500">
                Add the offer, proof, objections, process, and constraints the
                AI should reuse.
              </div>
            </div>

            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={runClarification}
                  disabled={clarifying}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {clarifying ? "Finding missing details…" : "Find missing details"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-medium text-zinc-500">
                  Optional import
                </div>
                <div className="mt-1 text-sm text-zinc-700">
                  Most operators should just answer the sections below. Use a brief only if you already have a document worth importing.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                {briefing ? (
                  <span>
                    {briefing.generatedAt
                      ? `Updated ${new Date(briefing.generatedAt).toLocaleString()}`
                      : "Brief added"}
                  </span>
                ) : (
                  <span>No document attached.</span>
                )}
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => setShowBriefImporter((current) => !current)}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    {showBriefImporter
                      ? "Close"
                      : briefing
                        ? "Change brief"
                        : "Add brief"}
                  </button>
                ) : null}
              </div>
            </div>

            {briefing ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-sm text-zinc-700">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-500">
                      Imported brief
                    </div>
                    <div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">
                      {autoFilledVisibleStageCount > 0
                        ? `This import drafted ${autoFilledVisibleStageCount} of ${visibleBriefStages.length} sections. Keep editing below to add nuance or correct wording.`
                        : "This import did not draft section answers yet. Add the missing operational detail below."}
                    </div>
                  </div>

                  {!readOnly ? (
                    <div className="flex flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                      <button
                        type="button"
                        onClick={() => void clearBriefing()}
                        aria-label="Remove imported brief"
                        title="Remove imported brief"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          aria-hidden="true"
                          className="h-4 w-4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4.5 6.5h11" />
                          <path d="M8 4.5h4" />
                          <path d="M7 8.5v6" />
                          <path d="M10 8.5v6" />
                          <path d="M13 8.5v6" />
                          <path d="M5.5 6.5l.6 8.1A1.5 1.5 0 0 0 7.6 16h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-8.1" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!readOnly && showBriefImporter ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold text-zinc-600">
                        Import a brief or paste notes
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors hover:border-zinc-300 hover:bg-zinc-50">
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          aria-hidden="true"
                          className="h-3.5 w-3.5 stroke-current"
                          strokeWidth="1.8"
                        >
                          <path d="M10 13.5V4.5" strokeLinecap="round" />
                          <path
                            d="M6.5 8 10 4.5 13.5 8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M4 14.5v.75A1.75 1.75 0 0 0 5.75 17h8.5A1.75 1.75 0 0 0 16 15.25v-.75"
                            strokeLinecap="round"
                          />
                        </svg>
                        {briefUploadBusy ? "Extracting..." : "Import file"}
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt,.md,.markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          disabled={briefUploadBusy}
                          onChange={async (e) => {
                            const file = e.target.files?.[0] || null;
                            if (!file) return;
                            await runBriefExtraction(file);
                            if (e.target) e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500">
                      Bring in a strategy brief, intake note, questionnaire, or operating summary if you already have one. Otherwise skip this and fill the sections directly.
                    </div>
                    <textarea
                      value={briefTextDraft}
                      onChange={(e) => setBriefTextDraft(e.target.value)}
                      rows={4}
                      className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-zinc-300"
                      placeholder="Paste the business document or raw company context here if you do not want to upload a file."
                    />
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-2 lg:w-48">
                    <button
                      type="button"
                      onClick={() => void runBriefExtraction(null)}
                      disabled={briefUploadBusy || !briefTextDraft.trim()}
                      className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {briefUploadBusy ? "Using notes..." : "Use pasted notes"}
                    </button>
                    <div className="text-xs leading-5 text-zinc-500">
                      PDF, DOCX, TXT, and Markdown.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              <div className="overflow-x-auto pb-1">
                <div className="flex min-w-max items-center gap-3">
                  <div className="flex items-center gap-2">
                    {visibleBriefStages.map((stage) => {
                    const stageText = joinGuidedStageAnswers(
                      guidedIntake?.[stage.key],
                    );
                    const isActive = activeBriefStage?.key === stage.key;
                    return (
                      <button
                        key={stage.key}
                        type="button"
                        onClick={() => handleContextStageClick(stage.key)}
                        className={[
                          "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                          isActive
                            ? "border-[rgba(29,78,216,0.28)] bg-[rgba(29,78,216,0.08)] text-brand-ink"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        <span>{stage.label}</span>
                        <span
                          className={[
                            "inline-flex h-2 w-2 rounded-full",
                            stageText
                              ? "bg-emerald-500"
                              : "bg-zinc-300",
                          ].join(" ")}
                        />
                      </button>
                    );
                    })}
                  </div>

                  {visibleBriefStages.length > 1 ? (
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveToBriefStage(activeBriefStageIndex - 1)}
                        disabled={!previousBriefStage}
                        className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40"
                      >
                        &lt; Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => moveToBriefStage(activeBriefStageIndex + 1)}
                        disabled={!nextBriefStage}
                        className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40"
                      >
                        Next &gt;
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  Green means saved context already exists for that section. Use the pills to jump, or move in order with Previous and Next.
                </div>
              </div>

              {activeBriefStage ? (
                <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-[11px] font-medium text-zinc-500">
                        Section {activeBriefStageIndex + 1} of{" "}
                        {visibleBriefStages.length}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-zinc-950">
                        {activeBriefStage.label}
                      </div>
                      <div className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
                        {activeBriefStage.description}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start">
                      <span
                        className={
                          activeBriefStageText
                            ? "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                            : "rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600"
                        }
                      >
                        {activeBriefStageText ? "Filled" : "Needs detail"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] ring-1 ring-inset ring-zinc-200/80">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-zinc-600">
                        Section completion
                      </div>
                      <div className="text-xs font-semibold text-zinc-700">
                        {activeBriefStageAnsweredCount}/
                        {activeBriefStage.questions.length} answered
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200/90">
                      <div
                        className="h-full rounded-full bg-brand-ink transition-all"
                        style={{
                          width: `${Math.round(
                            (activeBriefStageAnsweredCount /
                              activeBriefStage.questions.length) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {activeBriefStage.questions.map((question, index) => (
                        <span
                          key={`${activeBriefStage.key}-${question}`}
                          className={[
                            "rounded-full px-3 py-1 text-xs ring-1 ring-inset",
                            activeBriefStageAnswers[index]
                              ? "bg-brand-ink text-white ring-brand-ink/10"
                              : "bg-stone-50 text-zinc-600 ring-stone-200",
                          ].join(" ")}
                        >
                          Q{index + 1}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {activeBriefStage.questions.map((question, index) => {
                      const answer = activeBriefStageAnswers[index] || "";
                      const isDictatingThisAnswer =
                        dictating &&
                        dictationStageKeyRef.current === activeBriefStage.key &&
                        dictationQuestionIndexRef.current === index;
                      const isPolishingThisAnswer =
                        polishBusyKey ===
                        buildGuidedAnswerKey(activeBriefStage.key, index);
                      return (
                        <div
                          key={`${activeBriefStage.key}-answer-${index}`}
                          className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] ring-1 ring-inset ring-zinc-200/80"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-zinc-500">
                                {getGuidedQuestionHeading(activeBriefStage.key, index)}
                              </div>
                              <div className="mt-1 text-sm leading-6 text-zinc-700">
                                {question}
                              </div>
                            </div>

                            {!readOnly ? (
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void polishGuidedStageText(
                                      activeBriefStage.key,
                                      index,
                                    )
                                  }
                                  disabled={Boolean(polishBusyKey) || !normalizeWhitespace(answer)}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <svg
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 stroke-current"
                                    strokeWidth="1.7"
                                  >
                                    <path d="M10 2.5l1.2 3.3 3.3 1.2-3.3 1.2L10 11.5 8.8 8.2 5.5 7l3.3-1.2L10 2.5Z" strokeLinejoin="round" />
                                    <path d="M15.5 11.5l.8 2.1 2.2.8-2.2.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" strokeLinejoin="round" />
                                  </svg>
                                  <span>{isPolishingThisAnswer ? "Polishing..." : "AI polish"}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    startDictation(activeBriefStage.key, index)
                                  }
                                  disabled={!dictationSupported && !dictating}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-400 ring-1 ring-inset ring-zinc-200 transition-colors hover:text-brand-ink hover:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                                  title={
                                    dictationSupported
                                      ? isDictatingThisAnswer
                                        ? "Stop dictation"
                                        : "Start dictation for this answer"
                                      : "Speech-to-text is not available in this browser"
                                  }
                                  aria-label={
                                    isDictatingThisAnswer ? "Stop dictation" : "Start dictation"
                                  }
                                >
                                  <svg
                                    viewBox="0 0 20 20"
                                    fill="none"
                                    aria-hidden="true"
                                    className="h-4 w-4 stroke-current"
                                    strokeWidth="1.8"
                                  >
                                    <path d="M10 3.5a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0V6A2.5 2.5 0 0 1 10 3.5Z" />
                                    <path
                                      d="M5.5 9.5a4.5 4.5 0 0 0 9 0"
                                      strokeLinecap="round"
                                    />
                                    <path d="M10 14v2.5" strokeLinecap="round" />
                                    <path d="M7.5 16.5h5" strokeLinecap="round" />
                                  </svg>
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {activeBriefStage.key === "offerPricing" ? (
                            <OfferQuestionQuickFill
                              questionIndex={index}
                              answer={answer}
                              readOnly={readOnly}
                              onChange={(value) =>
                                updateGuidedStageText(
                                  activeBriefStage.key,
                                  value,
                                  index,
                                )
                              }
                              onCommit={(value) =>
                                void persistGuidedStageText(
                                  activeBriefStage.key,
                                  value,
                                  index,
                                )
                              }
                            />
                          ) : null}

                          <textarea
                            ref={(node) => {
                              activeBriefTextareaRefs.current[index] = node;
                            }}
                            value={answer}
                            onChange={(e) =>
                              updateGuidedStageText(
                                activeBriefStage.key,
                                e.target.value,
                                index,
                              )
                            }
                            onBlur={(e) =>
                              void persistGuidedStageText(
                                activeBriefStage.key,
                                e.target.value,
                                index,
                              )
                            }
                            disabled={Boolean(readOnly)}
                            rows={2}
                            className="mt-2 w-full rounded-2xl border border-zinc-100 bg-white px-3 py-2 text-sm leading-6 text-zinc-800 outline-none transition-colors focus:border-zinc-300 disabled:opacity-70"
                            placeholder={question}
                          />

                          {isDictatingThisAnswer ? (
                            <div className="mt-2 text-xs font-medium text-brand-ink">
                              Listening now. Words will appear in this answer box.
                            </div>
                          ) : null}

                          <div className="mt-2 text-xs text-zinc-500">
                            {normalizeWhitespace(answer).length}/2000 characters
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] ring-1 ring-inset ring-zinc-200/80 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm leading-6 text-zinc-600">
                      {nextBriefStage
                        ? activeBriefStageAnsweredCount ===
                          activeBriefStage.questions.length
                          ? `Ready for the next section: ${nextBriefStage.label}.`
                          : `Next up: ${nextBriefStage.label}. Finish this section or move ahead now.`
                        : "You are on the last section. Review the answers here, then save when the business profile feels right."}
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => moveToBriefStage(activeBriefStageIndex - 1)}
                        disabled={!previousBriefStage}
                        className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-40"
                      >
                        Previous section
                      </button>
                      {nextBriefStage ? (
                        <button
                          type="button"
                          onClick={() => moveToBriefStage(activeBriefStageIndex + 1)}
                          className="inline-flex items-center justify-center rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-ink/90"
                        >
                          Continue to {nextBriefStage.label}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-zinc-500">
                    {dictating
                      ? "Listening for this answer now."
                      : dictationSupported
                        ? "Use the mic on any question to talk freely, then use AI polish if you want the answer tightened up."
                        : "Speech-to-text depends on browser support and microphone permission."}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl bg-stone-50/90 px-4 py-3 text-xs leading-5 text-zinc-600 ring-1 ring-inset ring-stone-200/80">
                These sections are the editable source of truth for the business.
                Upload can draft them, but you can also dictate rough notes,
                polish them, and move section to section until the saved answers
                say exactly what you mean.
              </div>
            </div>
          </div>

          {dictationError ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {dictationError}
            </div>
          ) : null}

          {clarification || clarifying ? (
            <div className="mt-4 rounded-3xl border border-blue-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    Missing details review
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {clarification?.sourceSignature &&
                    clarification.sourceSignature !==
                      clarificationSourceSignature
                      ? "Saved from an earlier draft. Run this again if you want it to reflect your latest profile changes."
                      : "Saved to this workspace from the current profile draft so you can tighten missing context before saving."}
                  </div>
                </div>

                {!readOnly && clarification?.recommendedContext ? (
                  <button
                    type="button"
                    onClick={() =>
                      void appendToActiveBriefStage(
                        clarification.recommendedContext || "",
                      )
                    }
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    Append to this section
                  </button>
                ) : null}
              </div>

              {clarification?.summary ? (
                <div className="mt-3 text-sm text-zinc-700">
                  {clarification.summary}
                </div>
              ) : null}

              {clarification?.questions?.length ? (
                <div className="mt-4 space-y-3">
                  {clarification.questions.map((item, index) => (
                    <div
                      key={`${item.question}-${index}`}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3"
                    >
                      <div className="text-sm font-semibold text-zinc-900">
                        {index + 1}. {item.question}
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">
                        {item.reason}
                      </div>
                      {item.suggestedAnswerStarter ? (
                        <div className="mt-2 text-xs text-zinc-500">
                          Starter: {item.suggestedAnswerStarter}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {clarification?.recommendedContext ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div className="text-xs font-medium text-zinc-500">
                    Suggested detail to add
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                    {clarification.recommendedContext}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">
            Business font
          </label>
          <div className="mt-1">
            <PortalFontDropdown
              value={brandFontPresetKey}
              onChange={(k) => {
                if (readOnly) return;
                const key = String(k || "default");
                const next = applyFontPresetToStyle(key);
                setBrandFontFamily(next.fontFamily || "");
                setBrandFontGoogleFamily(next.fontGoogleFamily || "");
              }}
              extraOptions={[{ value: "default", label: "Default (app font)" }]}
              className="w-full"
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
              disabled={Boolean(readOnly)}
            />
          </div>

          {brandFontPresetKeyRaw === "custom" ? (
            <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              A custom font was previously set. Custom fonts are no longer
              supported. Choose a preset to update.
            </div>
          ) : null}
          <div className="mt-1 text-xs text-zinc-500">
            Used for hosted page styling and templates.
          </div>
        </div>

        <div className="sm:col-span-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          <div className="text-[11px] font-medium text-zinc-500">
            Platform color roles
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <span className="font-semibold text-zinc-900">Primary</span>{" "}
              drives dominant CTAs and the strongest branded moments.
            </div>
            <div>
              <span className="font-semibold text-zinc-900">Secondary</span>{" "}
              supports quieter accents and secondary actions, not full-surface
              washes.
            </div>
            <div>
              <span className="font-semibold text-zinc-900">Accent</span> is for
              highlights, status cues, and selective emphasis.
            </div>
            <div>
              <span className="font-semibold text-zinc-900">Text</span> is the
              default readable copy color across hosted surfaces.
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Brand primary color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(brandPrimaryHex, "#1d4ed8")}
              onChange={(e) => setBrandPrimaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick primary color"
            />
            <input
              value={brandPrimaryHex}
              onChange={(e) => setBrandPrimaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#1d4ed8"
            />
            <div
              className="h-10 w-10 rounded-2xl border border-zinc-200"
              style={{ background: safeColorValue(brandPrimaryHex, "#1d4ed8") }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Brand secondary color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(
                brandSecondaryHex,
                safeColorValue(brandPrimaryHex, "#1d4ed8"),
              )}
              onChange={(e) => setBrandSecondaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick secondary color"
            />
            <input
              value={brandSecondaryHex}
              onChange={(e) => setBrandSecondaryHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder={safeColorValue(brandPrimaryHex, "#1d4ed8")}
            />
            <div
              className="h-10 w-10 rounded-2xl border border-zinc-200"
              style={{
                background: safeColorValue(
                  brandSecondaryHex,
                  safeColorValue(brandPrimaryHex, "#1d4ed8"),
                ),
              }}
            />
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Used for supportive accents and secondary actions when the platform
            needs a second brand signal.
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-600">
            Brand accent color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(brandAccentHex, "#fb7185")}
              onChange={(e) => setBrandAccentHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick accent color"
            />
            <input
              value={brandAccentHex}
              onChange={(e) => setBrandAccentHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#fb7185"
            />
            <div
              className="h-10 w-10 rounded-2xl border border-zinc-200"
              style={{ background: safeColorValue(brandAccentHex, "#fb7185") }}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">
            Text color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={safeColorValue(brandTextHex, "#0f172a")}
              onChange={(e) => setBrandTextHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
              aria-label="Pick text color"
            />
            <input
              value={brandTextHex}
              onChange={(e) => setBrandTextHex(e.target.value)}
              disabled={Boolean(readOnly)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="#0f172a"
            />
            <div
              className="flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs"
              style={{ color: safeColorValue(brandTextHex, "#0f172a") }}
            >
              Aa
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                Hosted pages theme overrides
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Optional. Leave any field blank to inherit the theme derived
                from your brand colors. This affects hosted pages like blogs and
                reviews.
              </div>
            </div>
            {!readOnly ? (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                onClick={() => {
                  setHostedBgHex("");
                  setHostedSurfaceHex("");
                  setHostedSoftHex("");
                  setHostedBorderHex("");
                  setHostedTextHex("");
                  setHostedMutedTextHex("");
                  setHostedPrimaryHex("");
                  setHostedAccentHex("");
                  setHostedLinkHex("");
                }}
              >
                Reset hosted overrides
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Background
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedBgHex, "#ffffff")}
                  onChange={(e) => setHostedBgHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted background"
                />
                <input
                  value={hostedBgHex}
                  onChange={(e) => setHostedBgHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{ background: safeColorValue(hostedBgHex, "#ffffff") }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Surface (cards)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedSurfaceHex, "#ffffff")}
                  onChange={(e) => setHostedSurfaceHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted surface"
                />
                <input
                  value={hostedSurfaceHex}
                  onChange={(e) => setHostedSurfaceHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{
                    background: safeColorValue(hostedSurfaceHex, "#ffffff"),
                  }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Soft background (chips)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedSoftHex, "#f4f4f5")}
                  onChange={(e) => setHostedSoftHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted soft background"
                />
                <input
                  value={hostedSoftHex}
                  onChange={(e) => setHostedSoftHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{
                    background: safeColorValue(hostedSoftHex, "#f4f4f5"),
                  }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Border
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedBorderHex, "#e4e4e7")}
                  onChange={(e) => setHostedBorderHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted border"
                />
                <input
                  value={hostedBorderHex}
                  onChange={(e) => setHostedBorderHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{
                    background: safeColorValue(hostedBorderHex, "#e4e4e7"),
                  }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Text
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedTextHex, "#18181b")}
                  onChange={(e) => setHostedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted text"
                />
                <input
                  value={hostedTextHex}
                  onChange={(e) => setHostedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs"
                  style={{ color: safeColorValue(hostedTextHex, "#18181b") }}
                >
                  Aa
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Muted text
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(hostedMutedTextHex, "#52525b")}
                  onChange={(e) => setHostedMutedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted muted text"
                />
                <input
                  value={hostedMutedTextHex}
                  onChange={(e) => setHostedMutedTextHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="flex h-10 items-center rounded-2xl border border-zinc-200 bg-white px-3 text-xs"
                  style={{
                    color: safeColorValue(hostedMutedTextHex, "#52525b"),
                  }}
                >
                  Aa
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Primary (buttons)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(
                    hostedPrimaryHex,
                    safeColorValue(brandPrimaryHex, "#1d4ed8"),
                  )}
                  onChange={(e) => setHostedPrimaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted primary"
                />
                <input
                  value={hostedPrimaryHex}
                  onChange={(e) => setHostedPrimaryHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{
                    background: safeColorValue(
                      hostedPrimaryHex,
                      safeColorValue(brandPrimaryHex, "#1d4ed8"),
                    ),
                  }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Accent (highlights)
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(
                    hostedAccentHex,
                    safeColorValue(brandAccentHex, "#fb7185"),
                  )}
                  onChange={(e) => setHostedAccentHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted accent"
                />
                <input
                  value={hostedAccentHex}
                  onChange={(e) => setHostedAccentHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{
                    background: safeColorValue(
                      hostedAccentHex,
                      safeColorValue(brandAccentHex, "#fb7185"),
                    ),
                  }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600">
                Link
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={safeColorValue(
                    hostedLinkHex,
                    safeColorValue(brandPrimaryHex, "#2563eb"),
                  )}
                  onChange={(e) => setHostedLinkHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="h-10 w-10 cursor-pointer rounded-2xl border border-zinc-200 bg-white p-1 disabled:opacity-60"
                  aria-label="Pick hosted link"
                />
                <input
                  value={hostedLinkHex}
                  onChange={(e) => setHostedLinkHex(e.target.value)}
                  disabled={Boolean(readOnly)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="(blank = auto)"
                />
                <div
                  className="h-10 w-10 rounded-2xl border border-zinc-200"
                  style={{
                    background: safeColorValue(
                      hostedLinkHex,
                      safeColorValue(brandPrimaryHex, "#2563eb"),
                    ),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {!readOnly ? (
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving || !dirty}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            You have view-only access.
          </div>
        )}
        <div className="text-xs text-zinc-500 sm:self-center">
          We use this to personalize onboarding and content. Missing-details
          review stays in this workspace draft, while Save commits it to the
          shared business profile.
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6">
      {content}
    </div>
  );
}
