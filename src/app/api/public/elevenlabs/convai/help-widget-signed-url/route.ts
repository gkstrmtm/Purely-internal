import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function envElevenLabsApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
}

function envHelpWidgetAgentId(): string {
  return envFirst([
    "HELP_WIDGET_AGENT_ID",
    "NEXT_PUBLIC_HELP_WIDGET_AGENT_ID",
    "VOICE_AGENT_ID",
    "ELEVENLABS_AGENT_ID",
    "ELEVEN_LABS_AGENT_ID",
  ]).slice(0, 120);
}

export async function POST() {
  const apiKey = envElevenLabsApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing voice agent API key" }, { status: 400 });
  }

  const agentId = envHelpWidgetAgentId();
  if (!agentId) {
    return NextResponse.json({ ok: false, error: "Missing help widget agent ID" }, { status: 400 });
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

    return NextResponse.json({ ok: false, error: err }, { status: 502 });
  }

  return NextResponse.json({ ok: true, signedUrl });
}
