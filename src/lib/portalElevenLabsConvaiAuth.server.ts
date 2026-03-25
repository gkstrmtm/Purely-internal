import { prisma } from "@/lib/db";

export type PortalActionResult = {
  status: number;
  json: any;
};

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

async function getOwnerVoiceAgentApiKey(ownerId: string): Promise<string | null> {
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

export async function getElevenLabsConvaiConversationToken(opts: {
  ownerId: string;
  agentId: string;
}): Promise<PortalActionResult> {
  const agentId = String(opts.agentId || "").trim().slice(0, 120);
  if (!agentId) return { status: 400, json: { ok: false, error: "Invalid request" } };

  const apiKey = await getOwnerVoiceAgentApiKey(opts.ownerId);
  if (!apiKey) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "Missing voice agent API key. Add it in Portal → Profile or set VOICE_AGENT_API_KEY.",
      },
    };
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      cache: "no-store",
    },
  ).catch(() => null as any);

  const body = await res?.json?.().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : null;

  if (!res || !res.ok || !token) {
    const err =
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.error === "string"
          ? body.error
          : "Failed to get conversation token";

    return { status: 502, json: { ok: false, error: err } };
  }

  return { status: 200, json: { ok: true, token } };
}

export async function getElevenLabsConvaiConversationSignedUrl(opts: {
  ownerId: string;
  agentId: string;
}): Promise<PortalActionResult> {
  const agentId = String(opts.agentId || "").trim().slice(0, 120);
  if (!agentId) return { status: 400, json: { ok: false, error: "Invalid request" } };

  const apiKey = await getOwnerVoiceAgentApiKey(opts.ownerId);
  if (!apiKey) {
    return {
      status: 400,
      json: {
        ok: false,
        error: "Missing voice agent API key. Add it in Portal → Profile or set VOICE_AGENT_API_KEY.",
      },
    };
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      headers: {
        "xi-api-key": apiKey,
      },
      cache: "no-store",
    },
  ).catch(() => null as any);

  const body = await res?.json?.().catch(() => null);
  const signedUrl = typeof body?.signed_url === "string" ? body.signed_url : null;

  if (!res || !res.ok || !signedUrl) {
    const err =
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.error === "string"
          ? body.error
          : "Failed to get signed URL";

    return { status: 502, json: { ok: false, error: err } };
  }

  return { status: 200, json: { ok: true, signedUrl } };
}
