import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { generateText } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ExplainRequestSchema = z
  .object({
    request: z.unknown().optional().nullable(),
    round: z.unknown(),
  })
  .strict();

function safeJson(value: unknown, maxLen: number): string {
  try {
    const s = JSON.stringify(value, null, 2);
    return s.length > maxLen ? `${s.slice(0, maxLen)}\n... (truncated)` : s;
  } catch {
    const s = String(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}\n... (truncated)` : s;
  }
}

export async function POST(req: Request) {
  const auth = await requireClientSession(req, {
    apiKeyPermission: "pura.chat",
  });
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = ExplainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const round = parsed.data.round as any;
  const request = parsed.data.request as any;

  const system = [
    "You are a helpful guide for a non-programmer.",
    "Explain a portal AI simulator trace in very simple language.",
    "Do not use programming jargon unless you immediately define it.",
    "Be honest if something is unclear from the data.",
    "Use short sections and bullets.",
    "Never include secrets.",
  ].join("\n");

  const user = [
    "Here is one AI round from a simulator.",
    "Explain:",
    "1) What we sent to the AI (system + user prompt)",
    "2) What the AI returned (and whether it returned tool actions)",
    "3) What the server did next (resolve args, execute actions, ask for confirm, ask for clarification)",
    "4) If something looks wrong or confusing, what it probably means and what to try next",
    "",
    "Request (high level):",
    safeJson(request, 4000),
    "",
    "Round payload:",
    safeJson(
      {
        round: round?.round,
        at: round?.at,
        sentToModel: round?.sentToModel,
        sentToModelRetry: round?.sentToModelRetry,
        sentToModelRetry2: round?.sentToModelRetry2,
        sentToModelRetry3: round?.sentToModelRetry3,
        modelReturned: round?.modelReturned,
        modelReturnedRetry: round?.modelReturnedRetry,
        modelReturnedRetry2: round?.modelReturnedRetry2,
        modelReturnedRetry3: round?.modelReturnedRetry3,
        resolved: round?.resolved,
        executed: round?.executed,
        needsConfirm: round?.needsConfirm,
        clarify: round?.clarify,
        fallback: round?.fallback,
      },
      11000,
    ),
  ].join("\n");

  try {
    const explanation = String(
      await generateText({ system, user, temperature: 0.2 }),
    )
      .trim()
      .slice(0, 8000);

    return NextResponse.json(
      {
        ok: true,
        explanation: explanation || "No explanation was generated.",
      },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ? String(e.message) : "Failed to generate explanation",
      },
      { status: 500 },
    );
  }
}
