import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { resolveElevenLabsConvaiToolIdsByKeys } from "@/lib/elevenLabsConvai";
import { VOICE_TOOL_DEFS } from "@/lib/voiceAgentTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

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
  return key ? key : null;
}

export async function GET() {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const apiKey = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const apiKeyConfigured = Boolean(apiKey.trim());

  const toolKeys = VOICE_TOOL_DEFS.map((d) => d.key);
  const resolved = apiKeyConfigured
    ? await resolveElevenLabsConvaiToolIdsByKeys({ apiKey, toolKeys }).catch(() => ({ ok: false as const, error: "" }))
    : null;

  const toolIdsByKey = resolved && (resolved as any).ok === true ? (resolved as any).toolIds : ({} as Record<string, string[]>);

  const tools = VOICE_TOOL_DEFS.map((d) => {
    const xs = Array.isArray((toolIdsByKey as any)[d.key]) ? ((toolIdsByKey as any)[d.key] as string[]) : [];
    const toolId = xs.find((x) => typeof x === "string" && x.trim())?.trim() || null;
    return {
      key: d.key,
      label: d.label,
      description: d.description,
      toolId,
    };
  });

  return NextResponse.json({ ok: true, apiKeyConfigured, tools });
}
