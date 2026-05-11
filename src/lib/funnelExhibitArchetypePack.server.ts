import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FunnelBriefProfile } from "@/lib/funnelPageIntent";
import {
  buildDefaultFunnelExhibitArchetypePack,
  buildDefaultFunnelExhibitSeedPrompt,
  coerceFunnelExhibitArchetypePack,
  finalizeFunnelExhibitArchetypePack,
  type FunnelExhibitArchetypePack,
} from "@/lib/funnelExhibitArchetypes";

type FetchFunnelExhibitArchetypePackInput = {
  prompt?: string | null;
  funnelName?: string | null;
  routeLabel?: string | null;
  audience?: string | null;
  offer?: string | null;
  primaryCta?: string | null;
  brief?: FunnelBriefProfile | null;
  businessContext?: string | null;
};

type ExhibitArchetypeSeedPromptSource = "custom" | "markdown-template" | "inline-fallback";

export type ExhibitArchetypePackFetchDiagnostics = {
  enabled: boolean;
  agentUrl: string;
  usedRemote: boolean;
  fallbackReason: "disabled" | "timeout" | "http-error" | "request-failed" | "invalid-response" | null;
  elapsedMs: number;
  requestMethod: "POST";
  failureStatus: number | null;
  failureMessage: string | null;
  promptSource: ExhibitArchetypeSeedPromptSource;
  promptTemplatePath: string | null;
};

const EXHIBIT_ARCHETYPE_SEED_PROMPT_WORKSPACE_PATH = "docs/prompts/funnel-exhibit-archetype-seed.md";
const EXHIBIT_ARCHETYPE_SEED_PROMPT_FILE_PATH = join(process.cwd(), "docs", "prompts", "funnel-exhibit-archetype-seed.md");

let cachedExhibitArchetypeSeedPromptTemplate: string | null | undefined;

function cleanText(value: unknown, max = 400) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function readExhibitArchetypeSeedPromptTemplate() {
  if (typeof cachedExhibitArchetypeSeedPromptTemplate === "string") {
    return cachedExhibitArchetypeSeedPromptTemplate;
  }
  try {
    cachedExhibitArchetypeSeedPromptTemplate = readFileSync(EXHIBIT_ARCHETYPE_SEED_PROMPT_FILE_PATH, "utf8").trim();
  } catch {
    cachedExhibitArchetypeSeedPromptTemplate = "";
  }
  return cachedExhibitArchetypeSeedPromptTemplate;
}

function renderExhibitArchetypeSeedPromptTemplate(template: string, input: FetchFunnelExhibitArchetypePackInput) {
  const replacements: Record<string, string> = {
    funnelName: cleanText(input.funnelName, 120) || "Untitled funnel",
    routeLabel: cleanText(input.routeLabel, 120) || "/funnel",
    audience: cleanText(input.audience || input.brief?.audienceSummary, 180) || "Not provided",
    offer: cleanText(input.offer || input.brief?.offerSummary, 180) || "Not provided",
    primaryCta: cleanText(input.primaryCta, 120) || "Not provided",
    funnelGoal: cleanText(input.brief?.funnelGoal, 180) || "Not provided",
    businessContext: cleanText(input.businessContext || input.brief?.companyContext, 600) || "Not provided",
  };

  return template
    .replace(/\{\{(\w+)\}\}/g, (_match, key: string) => replacements[key] || "Not provided")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveExhibitArchetypeSeedPrompt(input: FetchFunnelExhibitArchetypePackInput = {}) {
  const template = readExhibitArchetypeSeedPromptTemplate();
  if (template) {
    const rendered = renderExhibitArchetypeSeedPromptTemplate(template, input);
    if (rendered) {
      return {
        prompt: rendered,
        source: "markdown-template" as const,
        promptTemplatePath: EXHIBIT_ARCHETYPE_SEED_PROMPT_WORKSPACE_PATH,
      };
    }
  }
  return {
    prompt: buildDefaultFunnelExhibitSeedPrompt(),
    source: "inline-fallback" as const,
    promptTemplatePath: null,
  };
}

export function buildExhibitArchetypeSeedPrompt(input: FetchFunnelExhibitArchetypePackInput = {}) {
  return resolveExhibitArchetypeSeedPrompt(input).prompt;
}

function buildFallbackPack(): FunnelExhibitArchetypePack {
  return finalizeFunnelExhibitArchetypePack(buildDefaultFunnelExhibitArchetypePack());
}

function cleanFailureMessage(value: unknown, max = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function inferExhibitFallbackReason(error: unknown): "timeout" | "request-failed" {
  const name = cleanFailureMessage((error as { name?: unknown })?.name, 80).toLowerCase();
  const message = cleanFailureMessage((error as { message?: unknown })?.message, 200).toLowerCase();
  if (name.includes("timeout") || name.includes("abort") || message.includes("timed out") || message.includes("abort")) {
    return "timeout";
  }
  return "request-failed";
}

export async function fetchFunnelExhibitArchetypePack(
  input: FetchFunnelExhibitArchetypePackInput,
): Promise<{ pack: FunnelExhibitArchetypePack; promptUsed: string; diagnostics: ExhibitArchetypePackFetchDiagnostics }> {
  const customPrompt = cleanText(input.prompt, 2400);
  const seedPrompt = resolveExhibitArchetypeSeedPrompt(input);
  const promptUsed = customPrompt || seedPrompt.prompt;
  const apiKey = cleanText(process.env.EXHIBIT_AGENT_API_KEY, 400);
  const enabled = process.env.EXHIBIT_AGENT_ENABLED === "1" || Boolean(apiKey);
  const agentUrl = cleanText(process.env.EXHIBIT_AGENT_URL, 400) || "https://exhibit-beta.vercel.app/api/agent";
  const timeoutMsRaw = Number(process.env.EXHIBIT_AGENT_TIMEOUT_MS || 3500);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1000, Math.min(12000, timeoutMsRaw)) : 3500;
  const fallback = buildFallbackPack();
  const promptSource: ExhibitArchetypeSeedPromptSource = customPrompt ? "custom" : seedPrompt.source;
  const promptTemplatePath = customPrompt ? null : seedPrompt.promptTemplatePath;
  const requestMethod = "POST" as const;

  if (!enabled) {
    return {
      pack: fallback,
      promptUsed,
      diagnostics: {
        enabled,
        agentUrl,
        usedRemote: false,
        fallbackReason: "disabled",
        elapsedMs: 0,
        requestMethod,
        failureStatus: null,
        failureMessage: null,
        promptSource,
        promptTemplatePath,
      },
    };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(agentUrl, {
      method: requestMethod,
      headers: {
        "content-type": "application/json",
        ...(apiKey
          ? {
              authorization: `Bearer ${apiKey}`,
              "x-api-key": apiKey,
            }
          : {}),
      },
      body: JSON.stringify({
        question: promptUsed,
        goal: "Structured funnel archetype pack for auto-attached generation guidance.",
        routeHint: "conversion-funnel",
        platform: "nextjs-tailwind-html",
        context: {
          funnelName: cleanText(input.funnelName, 120),
          routeLabel: cleanText(input.routeLabel, 120),
          audience: cleanText(input.audience || input.brief?.audienceSummary, 180),
          offer: cleanText(input.offer || input.brief?.offerSummary, 180),
          primaryCta: cleanText(input.primaryCta, 120),
          funnelGoal: cleanText(input.brief?.funnelGoal, 180),
          businessContext: cleanText(input.businessContext || input.brief?.companyContext, 500),
          outputShape: {
            summary: "string",
            designProfileId: "string",
            categories: ["string"],
            archetypes: [
              {
                id: "string",
                label: "string",
                pageTypes: ["string"],
                triggers: ["string"],
                shellPosture: "string",
                heroHierarchy: ["string"],
                sectionSequence: ["string"],
                proofStrategy: "string",
                ctaCadence: "string",
                designTone: "string",
                antiPatterns: ["string"],
                resourceCategories: ["string"],
              },
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const responseText = cleanFailureMessage(await res.text().catch(() => ""), 240) || `HTTP ${res.status}`;
      return {
        pack: fallback,
        promptUsed,
        diagnostics: {
          enabled,
          agentUrl,
          usedRemote: false,
          fallbackReason: "http-error",
          elapsedMs: Date.now() - startedAt,
          requestMethod,
          failureStatus: res.status,
          failureMessage: responseText,
          promptSource,
          promptTemplatePath,
        },
      };
    }
    const raw = (await res.json().catch(() => null)) as unknown;
    const parsed = coerceFunnelExhibitArchetypePack(raw);
    if (!parsed) {
      return {
        pack: fallback,
        promptUsed,
        diagnostics: {
          enabled,
          agentUrl,
          usedRemote: false,
          fallbackReason: "invalid-response",
          elapsedMs: Date.now() - startedAt,
          requestMethod,
          failureStatus: null,
          failureMessage: "Remote Exhibit response did not match the expected archetype-pack shape.",
          promptSource,
          promptTemplatePath,
        },
      };
    }
    return {
      pack: finalizeFunnelExhibitArchetypePack({
        ...parsed,
        source: "agent",
        generatedAt: new Date().toISOString(),
      }),
      promptUsed,
      diagnostics: {
        enabled,
        agentUrl,
        usedRemote: true,
        fallbackReason: null,
        elapsedMs: Date.now() - startedAt,
        requestMethod,
        failureStatus: null,
        failureMessage: null,
        promptSource,
        promptTemplatePath,
      },
    };
  } catch (error) {
    const fallbackReason = inferExhibitFallbackReason(error);
    return {
      pack: fallback,
      promptUsed,
      diagnostics: {
        enabled,
        agentUrl,
        usedRemote: false,
        fallbackReason,
        elapsedMs: Date.now() - startedAt,
        requestMethod,
        failureStatus: null,
        failureMessage: cleanFailureMessage((error as { message?: unknown })?.message, 240) || null,
        promptSource,
        promptTemplatePath,
      },
    };
  }
}