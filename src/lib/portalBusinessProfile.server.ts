import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getAiReceptionistServiceData, setAiReceptionistSettings } from "@/lib/aiReceptionist";
import type {
  BusinessProfileBriefStageSuggestion,
  BusinessProfileGuidedIntake,
  BusinessProfilePathStageKey,
} from "@/lib/businessProfilePath";
import {
  BUSINESS_PROFILE_FIELD_LABELS,
  BUSINESS_PROFILE_PATH_STAGE_BY_KEY,
  BUSINESS_PROFILE_PATH_STAGES,
  isBusinessProfilePathStageKey,
  isBusinessProfileSuggestedFieldKey,
} from "@/lib/businessProfilePath";
import { getOrCreateOwnerMailboxAddress } from "@/lib/portalMailbox";
import { coerceFontFamily, coerceGoogleFamily } from "@/lib/fontPresets";
import { getHostedTheme, setHostedTheme } from "@/lib/hostedTheme";

export type PortalActionResult = {
  status: number;
  json: any;
};

export type BusinessProfileClarificationQuestion = {
  question: string;
  reason: string;
  suggestedAnswerStarter?: string;
};

export type BusinessProfileClarification = {
  summary: string;
  questions: BusinessProfileClarificationQuestion[];
  recommendedContext?: string;
  sourceSignature?: string;
  generatedAt: string;
};

export type BusinessProfileWorkspaceDraft = {
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

export type BusinessProfileBriefing = {
  sourceName?: string;
  sourceType?: string;
  sourceSignature?: string;
  uploadedAt: string;
  generatedAt: string;
  summary: string;
  stages: BusinessProfileBriefStageSuggestion[];
};

type BusinessProfileWorkspaceData = {
  version: 1;
  draftProfile: BusinessProfileWorkspaceDraft | null;
  clarification: BusinessProfileClarification | null;
  briefing: BusinessProfileBriefing | null;
  guidedIntake: BusinessProfileGuidedIntake | null;
};

const BUSINESS_PROFILE_SERVICE_SLUG = "businessProfile";

export const BusinessProfileUpsertSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required"),
  websiteUrl: z.string().trim().max(500).optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  businessModel: z.string().trim().max(200).optional().or(z.literal("")),
  primaryGoals: z.array(z.string().trim().min(1)).max(10).optional(),
  targetCustomer: z.string().trim().max(240).optional().or(z.literal("")),
  brandVoice: z.string().trim().max(240).optional().or(z.literal("")),
  businessContext: z.string().trim().max(8000).optional().or(z.literal("")),

  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  brandPrimaryHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Primary color must be a hex code like #1d4ed8")
    .optional()
    .or(z.literal("")),
  brandSecondaryHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Secondary color must be a hex code like #22c55e")
    .optional()
    .or(z.literal("")),
  brandAccentHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Accent color must be a hex code like #fb7185")
    .optional()
    .or(z.literal("")),
  brandTextHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Text color must be a hex code like #0f172a")
    .optional()
    .or(z.literal("")),

  brandFontFamily: z.string().trim().max(200).optional().or(z.literal("")),
  brandFontGoogleFamily: z.string().trim().max(80).optional().or(z.literal("")),

  hostedTheme: z
    .object({
      bgHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Background must be a hex code like #ffffff")
        .optional()
        .or(z.literal("")),
      surfaceHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Surface must be a hex code like #ffffff")
        .optional()
        .or(z.literal("")),
      softHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Soft background must be a hex code")
        .optional()
        .or(z.literal("")),
      borderHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Border must be a hex code")
        .optional()
        .or(z.literal("")),
      textHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Text must be a hex code")
        .optional()
        .or(z.literal("")),
      mutedTextHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Muted text must be a hex code")
        .optional()
        .or(z.literal("")),
      primaryHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Primary must be a hex code")
        .optional()
        .or(z.literal("")),
      accentHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Accent must be a hex code")
        .optional()
        .or(z.literal("")),
      linkHex: z
        .string()
        .trim()
        .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Link must be a hex code")
        .optional()
        .or(z.literal("")),
    })
    .optional(),
});

function emptyToNull(value: string | undefined) {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length ? v : null;
}

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

function cleanHex(value: unknown) {
  const next = cleanText(value, 16);
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next) ? next : "";
}

function normalizeWorkspaceDraftHostedTheme(value: unknown): BusinessProfileWorkspaceDraft["hostedTheme"] | undefined {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!rec) return undefined;

  const hostedTheme = {
    bgHex: cleanHex(rec.bgHex),
    surfaceHex: cleanHex(rec.surfaceHex),
    softHex: cleanHex(rec.softHex),
    borderHex: cleanHex(rec.borderHex),
    textHex: cleanHex(rec.textHex),
    mutedTextHex: cleanHex(rec.mutedTextHex),
    primaryHex: cleanHex(rec.primaryHex),
    accentHex: cleanHex(rec.accentHex),
    linkHex: cleanHex(rec.linkHex),
  };

  return Object.values(hostedTheme).some(Boolean) ? hostedTheme : undefined;
}

export function normalizeBusinessProfileWorkspaceDraft(input: unknown): BusinessProfileWorkspaceDraft | null {
  const rec = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!rec) return null;

  const draft: BusinessProfileWorkspaceDraft = {
    businessName: cleanText(rec.businessName, 200),
    websiteUrl: cleanText(rec.websiteUrl, 500),
    industry: cleanText(rec.industry, 120),
    businessModel: cleanText(rec.businessModel, 200),
    primaryGoals: cleanGoals(rec.primaryGoals),
    targetCustomer: cleanText(rec.targetCustomer, 240),
    brandVoice: cleanText(rec.brandVoice, 240),
    businessContext: cleanParagraph(rec.businessContext, 8000),
    logoUrl: cleanText(rec.logoUrl, 500),
    brandPrimaryHex: cleanHex(rec.brandPrimaryHex),
    brandSecondaryHex: cleanHex(rec.brandSecondaryHex),
    brandAccentHex: cleanHex(rec.brandAccentHex),
    brandTextHex: cleanHex(rec.brandTextHex),
    brandFontFamily: cleanText(rec.brandFontFamily, 200),
    brandFontGoogleFamily: cleanText(rec.brandFontGoogleFamily, 80),
    hostedTheme: normalizeWorkspaceDraftHostedTheme(rec.hostedTheme),
  };

  return Object.values({
    ...draft,
    hostedTheme: draft.hostedTheme ? Object.values(draft.hostedTheme).join("") : "",
    primaryGoals: draft.primaryGoals?.join(" ") ?? "",
  }).some(Boolean)
    ? draft
    : null;
}

function normalizeBusinessProfileClarification(raw: unknown): BusinessProfileClarification | null {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;

  const questions = Array.isArray(rec.questions)
    ? rec.questions
        .map((item) => {
          const questionRec = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
          if (!questionRec) return null;
          const question = cleanText(questionRec.question, 280);
          const reason = cleanText(questionRec.reason, 280);
          const suggestedAnswerStarter = cleanText(questionRec.suggestedAnswerStarter, 400);
          if (!question || !reason) return null;
          return {
            question,
            reason,
            ...(suggestedAnswerStarter ? { suggestedAnswerStarter } : {}),
          };
        })
        .filter((item): item is BusinessProfileClarificationQuestion => Boolean(item))
        .slice(0, 3)
    : [];

  const summary = cleanText(rec.summary, 500);
  const recommendedContext = cleanParagraph(rec.recommendedContext, 1800);
  const sourceSignature = cleanText(rec.sourceSignature, 4000);
  const generatedAt = cleanText(rec.generatedAt, 80);
  if (!summary && !questions.length && !recommendedContext) return null;

  return {
    summary,
    questions,
    ...(recommendedContext ? { recommendedContext } : {}),
    ...(sourceSignature ? { sourceSignature } : {}),
    generatedAt: generatedAt || new Date().toISOString(),
  };
}

function normalizeBusinessProfileBriefing(raw: unknown): BusinessProfileBriefing | null {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;

  const stages: BusinessProfileBriefStageSuggestion[] = Array.isArray(rec.stages)
    ? rec.stages.reduce<BusinessProfileBriefStageSuggestion[]>((acc, item) => {
        const stageRec = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
        if (!stageRec || !isBusinessProfilePathStageKey(stageRec.key)) return acc;

        const suggestions = Array.isArray(stageRec.suggestions)
          ? stageRec.suggestions
              .map((suggestion) => {
                const suggestionRec = suggestion && typeof suggestion === "object" && !Array.isArray(suggestion)
                  ? (suggestion as Record<string, unknown>)
                  : null;
                if (!suggestionRec || !isBusinessProfileSuggestedFieldKey(suggestionRec.field)) return null;

                const field = suggestionRec.field;
                const value = field === "primaryGoals"
                  ? cleanGoals(suggestionRec.value)
                  : field === "businessContext"
                    ? cleanParagraph(suggestionRec.value, 1200)
                    : cleanText(suggestionRec.value, 320);
                if (!value || (Array.isArray(value) && !value.length)) return null;

                return {
                  field,
                  label: BUSINESS_PROFILE_FIELD_LABELS[field],
                  value,
                  ...(cleanText(suggestionRec.rationale, 280) ? { rationale: cleanText(suggestionRec.rationale, 280) } : {}),
                  ...(cleanParagraph(suggestionRec.sourceSnippet, 600) ? { sourceSnippet: cleanParagraph(suggestionRec.sourceSnippet, 600) } : {}),
                };
              })
              .filter((item): item is BusinessProfileBriefStageSuggestion["suggestions"][number] => Boolean(item))
              .slice(0, 6)
          : [];

        if (!suggestions.length) return acc;

        const key = stageRec.key as BusinessProfilePathStageKey;
        acc.push({
          key,
          label: String(BUSINESS_PROFILE_PATH_STAGE_BY_KEY[key].label),
          ...(cleanParagraph(stageRec.summary, 500) ? { summary: cleanParagraph(stageRec.summary, 500) } : {}),
          suggestions,
        });
        return acc;
      }, []).slice(0, 7)
    : [];

  const summary = cleanParagraph(rec.summary, 800);
  if (!summary && !stages.length) return null;

  return {
    ...(cleanText(rec.sourceName, 240) ? { sourceName: cleanText(rec.sourceName, 240) } : {}),
    ...(cleanText(rec.sourceType, 120) ? { sourceType: cleanText(rec.sourceType, 120) } : {}),
    ...(cleanText(rec.sourceSignature, 4000) ? { sourceSignature: cleanText(rec.sourceSignature, 4000) } : {}),
    uploadedAt: cleanText(rec.uploadedAt, 80) || new Date().toISOString(),
    generatedAt: cleanText(rec.generatedAt, 80) || new Date().toISOString(),
    summary,
    stages,
  };
}

function normalizeBusinessProfileGuidedIntake(raw: unknown): BusinessProfileGuidedIntake | null {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;

  const next: BusinessProfileGuidedIntake = {};

  for (const stage of BUSINESS_PROFILE_PATH_STAGES) {
    const rawAnswers = rec[stage.key];
    if (!Array.isArray(rawAnswers)) continue;

    const answers = stage.questions
      .map((_, index) => cleanParagraph(rawAnswers[index], 1200))
      .map((value) => value.trim());

    if (answers.some(Boolean)) {
      next[stage.key] = answers;
    }
  }

  return Object.keys(next).length ? next : null;
}

function parseBusinessProfileWorkspaceData(raw: unknown): BusinessProfileWorkspaceData {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  return {
    version: 1,
    draftProfile: normalizeBusinessProfileWorkspaceDraft(rec?.draftProfile),
    clarification: normalizeBusinessProfileClarification(rec?.clarification),
    briefing: normalizeBusinessProfileBriefing(rec?.briefing),
    guidedIntake: normalizeBusinessProfileGuidedIntake(rec?.guidedIntake),
  };
}

export async function getBusinessProfileWorkspaceData(ownerId: string): Promise<BusinessProfileWorkspaceData> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: BUSINESS_PROFILE_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseBusinessProfileWorkspaceData(row?.dataJson ?? null);
}

export async function setBusinessProfileWorkspaceData(
  ownerId: string,
  patch: {
    draftProfile?: BusinessProfileWorkspaceDraft | null;
    clarification?: BusinessProfileClarification | null;
    briefing?: BusinessProfileBriefing | null;
    guidedIntake?: BusinessProfileGuidedIntake | null;
  },
): Promise<BusinessProfileWorkspaceData> {
  const existingRow = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: BUSINESS_PROFILE_SERVICE_SLUG } },
    select: { status: true, dataJson: true },
  });

  const existingRecord = existingRow?.dataJson && typeof existingRow.dataJson === "object" && !Array.isArray(existingRow.dataJson)
    ? (existingRow.dataJson as Record<string, unknown>)
    : {};
  const existing = parseBusinessProfileWorkspaceData(existingRow?.dataJson ?? null);

  const nextDraft = Object.prototype.hasOwnProperty.call(patch, "draftProfile")
    ? normalizeBusinessProfileWorkspaceDraft(patch.draftProfile ?? null)
    : existing.draftProfile;
  const nextClarification = Object.prototype.hasOwnProperty.call(patch, "clarification")
    ? normalizeBusinessProfileClarification(patch.clarification ?? null)
    : existing.clarification;
  const nextBriefing = Object.prototype.hasOwnProperty.call(patch, "briefing")
    ? normalizeBusinessProfileBriefing(patch.briefing ?? null)
    : existing.briefing;
  const nextGuidedIntake = Object.prototype.hasOwnProperty.call(patch, "guidedIntake")
    ? normalizeBusinessProfileGuidedIntake(patch.guidedIntake ?? null)
    : existing.guidedIntake;

  const payload: Record<string, unknown> = {
    ...existingRecord,
    version: 1,
    draftProfile: nextDraft,
    clarification: nextClarification,
    briefing: nextBriefing,
    guidedIntake: nextGuidedIntake,
  };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: BUSINESS_PROFILE_SERVICE_SLUG } },
    create: { ownerId, serviceSlug: BUSINESS_PROFILE_SERVICE_SLUG, status: "IN_PROGRESS", dataJson: payload as Prisma.InputJsonValue },
    update: { status: existingRow?.status ?? "IN_PROGRESS", dataJson: payload as Prisma.InputJsonValue },
    select: { dataJson: true },
  });

  return parseBusinessProfileWorkspaceData(row.dataJson);
}

function coerceWebsiteUrl(value: string | undefined): { ok: true; url: string | null } | { ok: false; error: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: true, url: null };

  const withProtocol = /^(https?:\/\/)/i.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(withProtocol);
    if (!u.hostname) return { ok: false, error: "Website URL is invalid" };
    if (!/\./.test(u.hostname)) return { ok: false, error: "Website URL must include a valid domain" };
    if (!["http:", "https:"].includes(u.protocol)) return { ok: false, error: "Website URL must start with http:// or https://" };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "Website URL is invalid (try including https://)" };
  }
}

type ProfileColumnFlags = {
  websiteUrl: boolean;
  industry: boolean;
  businessModel: boolean;
  primaryGoals: boolean;
  targetCustomer: boolean;
  brandVoice: boolean;
  businessContext: boolean;
  logoUrl: boolean;
  brandPrimaryHex: boolean;
  brandSecondaryHex: boolean;
  brandAccentHex: boolean;
  brandTextHex: boolean;
  brandFontFamily: boolean;
  brandFontGoogleFamily: boolean;
  updatedAt: boolean;
};

async function getProfileColumnFlags(): Promise<ProfileColumnFlags> {
  const [
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
    updatedAt,
  ] = await Promise.all([
    hasPublicColumn("BusinessProfile", "websiteUrl"),
    hasPublicColumn("BusinessProfile", "industry"),
    hasPublicColumn("BusinessProfile", "businessModel"),
    hasPublicColumn("BusinessProfile", "primaryGoals"),
    hasPublicColumn("BusinessProfile", "targetCustomer"),
    hasPublicColumn("BusinessProfile", "brandVoice"),
    hasPublicColumn("BusinessProfile", "businessContext"),
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandSecondaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
    hasPublicColumn("BusinessProfile", "brandFontFamily"),
    hasPublicColumn("BusinessProfile", "brandFontGoogleFamily"),
    hasPublicColumn("BusinessProfile", "updatedAt"),
  ]);

  return {
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
    updatedAt,
  };
}

function profileSelect(flags: ProfileColumnFlags) {
  const select: Record<string, boolean> = {
    businessName: true,
  };

  if (flags.websiteUrl) select.websiteUrl = true;
  if (flags.industry) select.industry = true;
  if (flags.businessModel) select.businessModel = true;
  if (flags.primaryGoals) select.primaryGoals = true;
  if (flags.targetCustomer) select.targetCustomer = true;
  if (flags.brandVoice) select.brandVoice = true;
  if (flags.businessContext) select.businessContext = true;
  if (flags.logoUrl) select.logoUrl = true;
  if (flags.brandPrimaryHex) select.brandPrimaryHex = true;
  if (flags.brandSecondaryHex) select.brandSecondaryHex = true;
  if (flags.brandAccentHex) select.brandAccentHex = true;
  if (flags.brandTextHex) select.brandTextHex = true;
  if (flags.brandFontFamily) select.brandFontFamily = true;
  if (flags.brandFontGoogleFamily) select.brandFontGoogleFamily = true;
  if (flags.updatedAt) select.updatedAt = true;

  return select as any;
}

function normalizeProfile(row: any, flags: ProfileColumnFlags) {
  return {
    businessName: row.businessName,
    websiteUrl: flags.websiteUrl ? (row.websiteUrl ?? null) : null,
    industry: flags.industry ? (row.industry ?? null) : null,
    businessModel: flags.businessModel ? (row.businessModel ?? null) : null,
    primaryGoals: flags.primaryGoals ? ((row.primaryGoals as unknown) ?? null) : null,
    targetCustomer: flags.targetCustomer ? (row.targetCustomer ?? null) : null,
    brandVoice: flags.brandVoice ? (row.brandVoice ?? null) : null,
    businessContext: flags.businessContext ? (row.businessContext ?? null) : null,
    logoUrl: flags.logoUrl ? (row.logoUrl ?? null) : null,
    brandPrimaryHex: flags.brandPrimaryHex ? (row.brandPrimaryHex ?? null) : null,
    brandSecondaryHex: flags.brandSecondaryHex ? (row.brandSecondaryHex ?? null) : null,
    brandAccentHex: flags.brandAccentHex ? (row.brandAccentHex ?? null) : null,
    brandTextHex: flags.brandTextHex ? (row.brandTextHex ?? null) : null,
    brandFontFamily: flags.brandFontFamily ? (row.brandFontFamily ?? null) : null,
    brandFontGoogleFamily: flags.brandFontGoogleFamily ? (row.brandFontGoogleFamily ?? null) : null,
    updatedAt: flags.updatedAt ? row.updatedAt : null,
  };
}

export async function getPortalBusinessProfile(opts: { ownerId: string }): Promise<PortalActionResult> {
  const ownerId = String(opts.ownerId || "").trim();
  if (!ownerId) return { status: 400, json: { ok: false, error: "Missing ownerId" } };

  const flags = await getProfileColumnFlags();

  const [profile, hostedTheme, workspace] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { ownerId }, select: profileSelect(flags) }),
    getHostedTheme(ownerId),
    getBusinessProfileWorkspaceData(ownerId),
  ]);

  const normalized = profile ? normalizeProfile(profile as any, flags) : null;
  return {
    status: 200,
    json: {
      ok: true,
      profile: normalized ? { ...normalized, hostedTheme } : null,
      draftProfile: workspace.draftProfile,
      clarification: workspace.clarification,
      briefing: workspace.briefing,
      guidedIntake: workspace.guidedIntake,
    },
  };
}

export async function upsertPortalBusinessProfile(opts: {
  ownerId: string;
  body: unknown;
}): Promise<PortalActionResult> {
  const ownerId = String(opts.ownerId || "").trim();
  if (!ownerId) return { status: 400, json: { error: "Missing ownerId" } };

  const parsed = BusinessProfileUpsertSchema.safeParse(opts.body);
  if (!parsed.success) {
    return { status: 400, json: { error: parsed.error.issues[0]?.message ?? "Invalid input" } };
  }

  const website = coerceWebsiteUrl(parsed.data.websiteUrl);
  if (!website.ok) {
    return { status: 400, json: { error: website.error } };
  }

  const prevProfile = await prisma.businessProfile
    .findUnique({ where: { ownerId }, select: { businessName: true } })
    .catch(() => null);
  const prevBusinessName = typeof prevProfile?.businessName === "string" ? prevProfile.businessName.trim() : "";

  const flags = await getProfileColumnFlags();

  const baseData: Record<string, unknown> = {
    ownerId,
    businessName: parsed.data.businessName.trim(),
  };

  if (flags.websiteUrl) baseData.websiteUrl = website.url;
  if (flags.industry) baseData.industry = emptyToNull(parsed.data.industry);
  if (flags.businessModel) baseData.businessModel = emptyToNull(parsed.data.businessModel);
  if (flags.primaryGoals) {
    baseData.primaryGoals = parsed.data.primaryGoals?.length ? parsed.data.primaryGoals : undefined;
  }
  if (flags.targetCustomer) baseData.targetCustomer = emptyToNull(parsed.data.targetCustomer);
  if (flags.brandVoice) baseData.brandVoice = emptyToNull(parsed.data.brandVoice);
  if (flags.businessContext) baseData.businessContext = emptyToNull(parsed.data.businessContext);
  if (flags.logoUrl) baseData.logoUrl = emptyToNull(parsed.data.logoUrl);
  if (flags.brandPrimaryHex) baseData.brandPrimaryHex = emptyToNull(parsed.data.brandPrimaryHex);
  if (flags.brandSecondaryHex) baseData.brandSecondaryHex = emptyToNull(parsed.data.brandSecondaryHex);
  if (flags.brandAccentHex) baseData.brandAccentHex = emptyToNull(parsed.data.brandAccentHex);
  if (flags.brandTextHex) baseData.brandTextHex = emptyToNull(parsed.data.brandTextHex);
  if (flags.brandFontFamily) baseData.brandFontFamily = coerceFontFamily(parsed.data.brandFontFamily) ?? null;
  if (flags.brandFontGoogleFamily) baseData.brandFontGoogleFamily = coerceGoogleFamily(parsed.data.brandFontGoogleFamily) ?? null;

  const updateData: Record<string, unknown> = {
    businessName: parsed.data.businessName.trim(),
  };
  if (flags.websiteUrl) updateData.websiteUrl = website.url;
  if (flags.industry) updateData.industry = emptyToNull(parsed.data.industry);
  if (flags.businessModel) updateData.businessModel = emptyToNull(parsed.data.businessModel);
  if (flags.primaryGoals) {
    updateData.primaryGoals = parsed.data.primaryGoals?.length ? parsed.data.primaryGoals : Prisma.DbNull;
  }
  if (flags.targetCustomer) updateData.targetCustomer = emptyToNull(parsed.data.targetCustomer);
  if (flags.brandVoice) updateData.brandVoice = emptyToNull(parsed.data.brandVoice);
  if (flags.businessContext) updateData.businessContext = emptyToNull(parsed.data.businessContext);
  if (flags.logoUrl) updateData.logoUrl = emptyToNull(parsed.data.logoUrl);
  if (flags.brandPrimaryHex) updateData.brandPrimaryHex = emptyToNull(parsed.data.brandPrimaryHex);
  if (flags.brandSecondaryHex) updateData.brandSecondaryHex = emptyToNull(parsed.data.brandSecondaryHex);
  if (flags.brandAccentHex) updateData.brandAccentHex = emptyToNull(parsed.data.brandAccentHex);
  if (flags.brandTextHex) updateData.brandTextHex = emptyToNull(parsed.data.brandTextHex);
  if (flags.brandFontFamily) updateData.brandFontFamily = coerceFontFamily(parsed.data.brandFontFamily) ?? null;
  if (flags.brandFontGoogleFamily) updateData.brandFontGoogleFamily = coerceGoogleFamily(parsed.data.brandFontGoogleFamily) ?? null;

  const row = await prisma.businessProfile.upsert({
    where: { ownerId },
    create: baseData as any,
    update: updateData as any,
    select: profileSelect(flags),
  });

  const hostedThemePatch = parsed.data.hostedTheme;
  const hostedTheme = hostedThemePatch
    ? await (async () => {
        const patch: Record<string, string | null> = {};
        const keys = [
          "bgHex",
          "surfaceHex",
          "softHex",
          "borderHex",
          "textHex",
          "mutedTextHex",
          "primaryHex",
          "accentHex",
          "linkHex",
        ] as const;
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(hostedThemePatch, k)) {
            patch[k] = emptyToNull((hostedThemePatch as any)[k]);
          }
        }
        return setHostedTheme(ownerId, patch as any);
      })()
    : await getHostedTheme(ownerId);

  try {
    const nextBusinessName = typeof (row as any)?.businessName === "string" ? String((row as any).businessName).trim() : "";
    if (nextBusinessName) {
      const ai = await getAiReceptionistServiceData(ownerId).catch(() => null);
      const currentAiName = typeof ai?.settings?.businessName === "string" ? ai.settings.businessName.trim() : "";
      const shouldSync = !currentAiName || (prevBusinessName && currentAiName === prevBusinessName);
      if (ai && shouldSync) {
        await setAiReceptionistSettings(ownerId, { ...ai.settings, businessName: nextBusinessName });
      }
    }
  } catch {
    // ignore
  }

  try {
    await getOrCreateOwnerMailboxAddress(ownerId);
  } catch {
    // ignore
  }

  await setBusinessProfileWorkspaceData(ownerId, { draftProfile: null });

  return { status: 200, json: { ok: true, profile: { ...normalizeProfile(row as any, flags), hostedTheme } } };
}
