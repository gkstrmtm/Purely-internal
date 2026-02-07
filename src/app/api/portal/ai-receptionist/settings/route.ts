import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import {
  getAiReceptionistServiceData,
  listAiReceptionistEvents,
  parseAiReceptionistSettings,
  regenerateAiReceptionistWebhookToken,
  setAiReceptionistSettings,
  toPublicSettings,
} from "@/lib/aiReceptionist";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function baseUrlFromRequest(req: Request): string {
  const env = process.env.NEXTAUTH_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const data = await getAiReceptionistServiceData(ownerId);
  const events = await listAiReceptionistEvents(ownerId, 80);

  const base = baseUrlFromRequest(req);
  const webhookUrl = `${base}/api/public/twilio/ai-receptionist/${data.settings.webhookToken}/voice`;

  const twilio = await getOwnerTwilioSmsConfigMasked(ownerId).catch(() => null);

  return NextResponse.json({
    ok: true,
    settings: toPublicSettings(data.settings),
    events,
    webhookUrl,
    twilioConfigured: Boolean(twilio?.configured),
    twilio: twilio ?? undefined,
    notes: {
      startupChecklist: [
        "In Twilio Console → Phone Numbers → (your number) → Voice & Fax",
        "Set 'A CALL COMES IN' to Webhook (POST)",
        "Paste the Webhook URL from this page",
      ],
    },
  });
}

const putSchema = z.object({
  settings: z.unknown().optional(),
  regenerateToken: z.boolean().optional(),
  clearVoiceAgentKey: z.boolean().optional(),
  clearElevenLabsKey: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.regenerateToken) {
    const next = await regenerateAiReceptionistWebhookToken(ownerId);
    const events = await listAiReceptionistEvents(ownerId, 80);
    const base = baseUrlFromRequest(req);
    const webhookUrl = `${base}/api/public/twilio/ai-receptionist/${next.webhookToken}/voice`;
    return NextResponse.json({ ok: true, settings: toPublicSettings(next), events, webhookUrl });
  }

  const current = await getAiReceptionistServiceData(ownerId);
  const rawSettings = parsed.data.settings ?? {};

  // Preserve secrets unless explicitly cleared or replaced.
  const rawRec = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? (rawSettings as Record<string, unknown>)
    : {};

  if (parsed.data.clearVoiceAgentKey || parsed.data.clearElevenLabsKey) {
    rawRec.voiceAgentApiKey = "";
    // Legacy key name kept for older stored payloads.
    rawRec.elevenLabsApiKey = "";
  }

  const normalized = parseAiReceptionistSettings(rawRec, current.settings);
  const next = await setAiReceptionistSettings(ownerId, normalized);

  const events = await listAiReceptionistEvents(ownerId, 80);
  const base = baseUrlFromRequest(req);
  const webhookUrl = `${base}/api/public/twilio/ai-receptionist/${next.webhookToken}/voice`;

  return NextResponse.json({ ok: true, settings: toPublicSettings(next), events, webhookUrl });
}
