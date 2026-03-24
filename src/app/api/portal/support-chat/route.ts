import { z } from "zod";

import { isPortalSupportChatConfigured, runPortalSupportChat } from "@/lib/portalSupportChat";

const SupportChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  url: z.string().trim().optional(),
  meta: z
    .object({
      buildSha: z.string().nullable().optional(),
      commitRef: z.string().nullable().optional(),
      deploymentId: z.string().nullable().optional(),
      nodeEnv: z.string().nullable().optional(),
      clientTime: z.string().optional(),
    })
    .optional(),
  context: z
    .object({
      recentMessages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            text: z.string().trim().min(1).max(2000),
          }),
        )
        .optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  if (!isPortalSupportChatConfigured()) {
    return Response.json(
      { ok: false, error: "Support chat is not configured for this environment." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SupportChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  try {
    const { message, url, meta, context } = parsed.data;
    const reply = await runPortalSupportChat({ message, url, meta, recentMessages: context?.recentMessages });
    return Response.json({ ok: true, reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: `Support chat failed. ${msg}` }, { status: 500 });
  }
}
