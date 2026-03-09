import { z } from "zod";

import { generateText } from "@/lib/ai";

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

function isAiConfigured() {
  return Boolean((process.env.AI_BASE_URL ?? "").trim() && (process.env.AI_API_KEY ?? "").trim());
}

export async function POST(req: Request) {
  if (!isAiConfigured()) {
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

  const { message, url, meta, context } = parsed.data;
  const recent = (context?.recentMessages ?? []).slice(-12);

  const transcript = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const system = [
    "You are Purely Automation portal support.",
    "Be concise, practical, and friendly.",
    "Ask 1-2 clarifying questions only if needed.",
    "When you suspect a bug, instruct the user to click 'Report bug' and include what they clicked and what they expected.",
    "Do not mention internal implementation details or vendors.",
  ].join(" ");

  const user = [
    url ? `URL: ${url}` : "",
    meta?.buildSha ? `Build: ${meta.buildSha}` : "",
    transcript ? `Recent chat:\n${transcript}` : "",
    `User message: ${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const reply = await generateText({ system, user });
    return Response.json({ ok: true, reply: String(reply || "").trim() || "Okay — can you share one more detail?" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: `Support chat failed. ${msg}` }, { status: 500 });
  }
}
