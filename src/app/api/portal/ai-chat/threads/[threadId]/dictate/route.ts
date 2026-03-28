import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { ensurePortalAiChatSchema } from "@/lib/portalAiChatSchema";
import { canAccessPortalAiChatThread } from "@/lib/portalAiChatSharing";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { listElevenLabsVoices, synthesizeElevenLabsVoicePreview } from "@/lib/elevenLabsConvai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

const postSchema = z
  .object({
    messageId: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .optional();

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

  const raw = rec?.voiceAgentApiKey ?? rec?.elevenLabsApiKey;
  const key = typeof raw === "string" ? raw.trim().slice(0, 400) : "";
  return key || null;
}

async function getProfileVoiceId(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceId ?? (rec as any)?.voiceAgentVoiceId ?? (rec as any)?.defaultVoiceId;
  const voiceId = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
  return voiceId || null;
}

async function getAiReceptionistVoiceConfig(ownerId: string): Promise<{ voiceId: string | null; apiKey: string | null }> {
  const data = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const voiceId = typeof (data as any)?.settings?.voiceId === "string" ? String((data as any).settings.voiceId).trim().slice(0, 200) : "";
  const apiKey = typeof (data as any)?.settings?.voiceAgentApiKey === "string" ? String((data as any).settings.voiceAgentApiKey).trim().slice(0, 400) : "";
  return { voiceId: voiceId || null, apiKey: apiKey || null };
}

function friendlyVoiceAgentError(status?: number): string {
  if (status === 401 || status === 403) return "ElevenLabs API key is invalid. Update it in Profile and try again.";
  if (status === 429) return "ElevenLabs is temporarily rate-limited. Please try again in a minute.";
  return "Dictation failed. Please try again.";
}

function toSpeakableText(raw: string): string {
  let t = String(raw || "");

  // Markdown links: [label](url) -> label
  t = t.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/gi, (_m, label, url) => {
    const safeLabel = String(label || "").replace(/\s+/g, " ").trim();
    void url;
    return safeLabel || "Link";
  });

  // Bare URLs -> "link" (avoid reading out long URLs)
  t = t.replace(/\bhttps?:\/\/[^\s)]+/gi, (u) => {
    void u;
    return "link";
  });

  // Strip code blocks/backticks
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");

  // Strip remaining markdown styling
  t = t.replace(/^>\s?/gm, "");
  t = t.replace(/[*_~#]+/g, "");

  // Collapse whitespace
  t = t.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

  // Cap to keep TTS latency reasonable.
  return t.slice(0, 1200);
}

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  await ensurePortalAiChatSchema();

  const ownerId = auth.session.user.id;
  const memberId = (auth.session.user as any).memberId || ownerId;
  const { threadId } = await ctx.params;

  const thread = await (prisma as any).portalAiChatThread.findFirst({
    where: { id: threadId, ownerId },
    select: { id: true, ownerId: true, createdByUserId: true },
  });
  if (!thread || !canAccessPortalAiChatThread({ thread, memberId })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const parsed = postSchema?.safeParse(await req.json().catch(() => null));
  const messageId = parsed?.success && parsed.data?.messageId ? parsed.data.messageId : null;

  const message = messageId
    ? await (prisma as any).portalAiChatMessage.findFirst({
        where: { ownerId, threadId, id: messageId, role: "assistant" },
        select: { id: true, text: true },
      })
    : await (prisma as any).portalAiChatMessage.findFirst({
        where: { ownerId, threadId, role: "assistant" },
        orderBy: { createdAt: "desc" },
        select: { id: true, text: true },
      });

  const speakable = toSpeakableText(String(message?.text || ""));
  if (!speakable) {
    return NextResponse.json({ ok: false, error: "No assistant message to dictate." }, { status: 400 });
  }

  const profileApiKey = ((await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "").trim();
  const profileVoiceId = ((await getProfileVoiceId(ownerId).catch(() => null)) || "").trim();
  const receptionist = await getAiReceptionistVoiceConfig(ownerId);

  const apiKey = (profileApiKey || receptionist.apiKey || envVoiceAgentApiKey() || "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing ElevenLabs API key. Set it in Profile (or AI Receptionist) first." },
      { status: 400 },
    );
  }

  let voiceId = (receptionist.voiceId || profileVoiceId || "").trim();
  if (!voiceId) {
    const voices = await listElevenLabsVoices({ apiKey });
    if (!voices.ok) {
      return NextResponse.json({ ok: false, error: friendlyVoiceAgentError(voices.status) }, { status: voices.status || 502 });
    }
    voiceId = String(voices.voices?.[0]?.id || "").trim();
  }

  if (!voiceId) {
    return NextResponse.json(
      { ok: false, error: "No ElevenLabs voices found for this API key." },
      { status: 400 },
    );
  }

  const result = await synthesizeElevenLabsVoicePreview({ apiKey, voiceId, text: speakable });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: friendlyVoiceAgentError(result.status) },
      { status: result.status || 502 },
    );
  }

  return new Response(Buffer.from(result.audio), {
    status: 200,
    headers: {
      "content-type": result.contentType || "audio/mpeg",
      "cache-control": "no-store",
    },
  });
}
