import { NextResponse } from "next/server";

import { synthesizeSpeech } from "@/lib/ai";
import { requireFunnelBuilderSession } from "@/lib/funnelBuilderAccess";
import {
  consumeFunnelBuilderAiCredits,
  enforceFunnelBuilderRouteRateLimit,
  readFunnelBuilderRequestId,
  recordFunnelBuilderAiFailure,
} from "@/lib/funnelBuilderGuardrails";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function sanitizeSpeechInput(raw: unknown) {
  return String(raw || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6000);
}

export async function POST(req: Request) {
  const auth = await requireFunnelBuilderSession();
  if (!auth.ok) {
    const message = auth.status === 403 ? "Forbidden" : "Unauthorized";
    return NextResponse.json({ ok: false, error: message }, { status: auth.status || 401 });
  }

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = sanitizeSpeechInput(body?.text);
  const ownerId = auth.session.user.id;
  const requestId = readFunnelBuilderRequestId(req);

  if (!text) {
    return NextResponse.json({ ok: false, error: "Text is required" }, { status: 400 });
  }

  const routeGate = await enforceFunnelBuilderRouteRateLimit({ ownerId, routeKey: "read-aloud", requestId });
  if (!routeGate.ok) {
    return NextResponse.json({ ok: false, error: routeGate.error }, { status: routeGate.status });
  }

  const charged = await consumeFunnelBuilderAiCredits({
    ownerId,
    routeKey: "read-aloud",
    requestId,
    amount: PORTAL_CREDIT_COSTS.aiCallStepGenerate,
    stepLabel: "Read-aloud audio",
  });
  if (!charged.ok) {
    return NextResponse.json({ ok: false, error: charged.error }, { status: charged.status });
  }

  try {
    const audio = await synthesizeSpeech({
      text,
      instructions: "Read this clearly, naturally, and precisely. Preserve numbers, pricing, step names, and contrast between short bullets and full sentences.",
    });

    return new Response(audio.bytes, {
      status: 200,
      headers: {
        "content-type": audio.mimeType,
        "cache-control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    await recordFunnelBuilderAiFailure({
      ownerId,
      routeKey: "read-aloud",
      requestId,
      stepLabel: "Read-aloud audio",
      reason: "tts_generation_failed",
    });
    console.error("[funnel-builder/read-aloud]", error);
    return NextResponse.json({ ok: false, error: "Unable to generate read-aloud audio right now." }, { status: 500 });
  }
}