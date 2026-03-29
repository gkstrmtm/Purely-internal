import { z } from "zod";

import { PortalAgentActionKeySchema, extractJsonObject, type PortalAgentActionKey } from "@/lib/portalAgentActions";

export const SCHEDULED_ACTION_PREFIX = "__PURA_SCHEDULED_ACTION__";

export type ScheduledActionEnvelope = {
  workTitle?: string | null;
  steps: Array<{ key: PortalAgentActionKey; title?: string | null; args?: Record<string, unknown> | null }>;
};

const EnvelopeSchema = z
  .object({
    workTitle: z.string().trim().max(200).optional().nullable(),
    steps: z
      .array(
        z
          .object({
            key: PortalAgentActionKeySchema,
            title: z.string().trim().max(120).optional().nullable(),
            args: z.record(z.string(), z.unknown()).optional().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

export function encodeScheduledActionEnvelope(env: ScheduledActionEnvelope): string {
  const workTitle = typeof env.workTitle === "string" ? env.workTitle.trim().slice(0, 200) : env.workTitle ?? null;
  const steps = (Array.isArray(env.steps) ? env.steps : []).slice(0, 6).map((s) => ({
    key: s.key,
    title: typeof s.title === "string" ? s.title.trim().slice(0, 120) : s.title ?? null,
    args: s.args && typeof s.args === "object" && !Array.isArray(s.args) ? s.args : {},
  }));

  const payload: ScheduledActionEnvelope = { ...(workTitle ? { workTitle } : {}), steps };
  return `${SCHEDULED_ACTION_PREFIX} ${JSON.stringify(payload)}`;
}

export function tryParseScheduledActionEnvelope(textRaw: string): ScheduledActionEnvelope | null {
  const t = String(textRaw || "").trim();
  if (!t.startsWith(SCHEDULED_ACTION_PREFIX)) return null;

  const jsonText = t.slice(SCHEDULED_ACTION_PREFIX.length).trim();
  const extracted = extractJsonObject(jsonText);
  const parsed = EnvelopeSchema.safeParse(extracted);
  if (!parsed.success) return null;

  const workTitle = parsed.data.workTitle ? String(parsed.data.workTitle).trim().slice(0, 200) : null;
  const steps = parsed.data.steps.map((s) => ({
    key: s.key,
    title: s.title ? String(s.title).trim().slice(0, 120) : null,
    args: s.args && typeof s.args === "object" && !Array.isArray(s.args) ? s.args : {},
  }));

  return { ...(workTitle ? { workTitle } : {}), steps };
}
