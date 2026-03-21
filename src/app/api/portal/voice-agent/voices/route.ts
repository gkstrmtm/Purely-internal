import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForAnyService } from "@/lib/portalAccess";
import { listElevenLabsVoices } from "@/lib/elevenLabsConvai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function envVoiceAgentApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
}

async function getProfileVoiceAgentApiKey(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentApiKey;
  const key = typeof raw === "string" ? raw.trim().slice(0, 400) : "";
  return key || envVoiceAgentApiKey() || null;
}

function friendlyVoiceAgentError(status?: number): string {
  if (status === 401 || status === 403) return "Voice agent API key is invalid. Update it in Profile and try again.";
  if (status === 429) return "Voice agent is temporarily rate-limited. Please try again in a minute.";
  return "Unable to load voices. Please try again.";
}

export async function GET() {
  const auth = await requireClientSessionForAnyService(["aiOutboundCalls", "aiReceptionist"], "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const apiKey = ((await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing voice agent API key. Set it in Profile first." },
      { status: 400 },
    );
  }

  const result = await listElevenLabsVoices({ apiKey });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: friendlyVoiceAgentError(result.status) },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json({ ok: true, voices: result.voices });
}
