import { NextResponse } from "next/server";
import { z } from "zod";

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

const bodySchema = z.object({
  agentId: z.string().trim().min(1).max(120),
});

export async function POST(req: Request) {
  const apiKey = envElevenLabsApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing voice agent API key" }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const agentId = parsed.data.agentId;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      headers: { "xi-api-key": apiKey },
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
