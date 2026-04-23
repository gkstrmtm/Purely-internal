import type { FunnelBriefProfile } from "@/lib/funnelPageIntent";
import {
  buildDefaultFunnelExhibitArchetypePack,
  buildDefaultFunnelExhibitSeedPrompt,
  coerceFunnelExhibitArchetypePack,
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

function cleanText(value: unknown, max = 400) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function buildExhibitArchetypeSeedPrompt() {
  return buildDefaultFunnelExhibitSeedPrompt();
}

function buildFallbackPack(): FunnelExhibitArchetypePack {
  return buildDefaultFunnelExhibitArchetypePack();
}

export async function fetchFunnelExhibitArchetypePack(
  input: FetchFunnelExhibitArchetypePackInput,
): Promise<{ pack: FunnelExhibitArchetypePack; promptUsed: string }> {
  const promptUsed = cleanText(input.prompt, 2400) || buildExhibitArchetypeSeedPrompt();
  const apiKey = cleanText(process.env.EXHIBIT_AGENT_API_KEY, 400);
  const enabled = process.env.EXHIBIT_AGENT_ENABLED === "1" || Boolean(apiKey);
  const agentUrl = cleanText(process.env.EXHIBIT_AGENT_URL, 400) || "https://exhibit-beta.vercel.app/api/agent";
  const timeoutMsRaw = Number(process.env.EXHIBIT_AGENT_TIMEOUT_MS || 3500);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1000, Math.min(12000, timeoutMsRaw)) : 3500;
  const fallback = buildFallbackPack();

  if (!enabled) return { pack: fallback, promptUsed };

  try {
    const res = await fetch(agentUrl, {
      method: "POST",
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

    if (!res.ok) return { pack: fallback, promptUsed };
    const raw = (await res.json().catch(() => null)) as unknown;
    const parsed = coerceFunnelExhibitArchetypePack(raw);
    if (!parsed) return { pack: fallback, promptUsed };
    return {
      pack: {
        ...parsed,
        source: "agent",
        generatedAt: new Date().toISOString(),
      },
      promptUsed,
    };
  } catch {
    return { pack: fallback, promptUsed };
  }
}