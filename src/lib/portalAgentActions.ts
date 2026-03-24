import { z } from "zod";

export const PortalAgentActionKeySchema = z.enum([
  "tasks.create",
  "funnel.create",
  "blogs.generate_now",
  "newsletter.generate_now",
  "automations.run",
]);

export type PortalAgentActionKey = z.infer<typeof PortalAgentActionKeySchema>;

export const PortalAgentActionArgsSchemaByKey = {
  "tasks.create": z
    .object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(5000).optional(),
      assignedToUserId: z.string().trim().min(1).optional().nullable(),
      dueAtIso: z.string().trim().optional().nullable(),
    })
    .strict(),

  "funnel.create": z
    .object({
      name: z.string().trim().min(1).max(120),
      slug: z.string().trim().min(2).max(60),
    })
    .strict(),

  "blogs.generate_now": z.object({}).strict(),

  "newsletter.generate_now": z
    .object({
      kind: z.enum(["external", "internal"]),
    })
    .strict(),

  "automations.run": z
    .object({
      automationId: z.string().trim().min(1).max(80),
      contact: z
        .object({
          id: z.string().max(80).optional(),
          name: z.string().max(200).optional(),
          email: z.string().max(200).optional(),
          phone: z.string().max(32).optional(),
        })
        .optional(),
    })
    .strict(),
} as const;

export type PortalAgentActionArgs<K extends PortalAgentActionKey> = z.infer<(typeof PortalAgentActionArgsSchemaByKey)[K]>;

export type PortalAgentActionProposal = {
  key: PortalAgentActionKey;
  title: string;
  confirmLabel?: string;
  args: Record<string, unknown>;
};

export function portalAgentActionsIndexText(): string {
  return [
    "Available actions (choose at most 2):",
    "- tasks.create: Create a portal task (fields: title, description?, assignedToUserId?, dueAtIso?)",
    "- funnel.create: Create a Funnel Builder funnel (fields: name, slug)",
    "- blogs.generate_now: Generate a blog draft now",
    "- newsletter.generate_now: Generate a newsletter draft now (fields: kind=external|internal)",
    "- automations.run: Run an automation by id (fields: automationId, contact?)",
  ].join("\n");
}

export function extractJsonObject(text: string): unknown {
  const raw = String(text || "").trim();
  if (!raw) return null;

  // Prefer fenced JSON blocks.
  const fence = /```json\s*([\s\S]*?)\s*```/i.exec(raw);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      // fallthrough
    }
  }

  // Fallback: first {...} blob.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = raw.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
}
