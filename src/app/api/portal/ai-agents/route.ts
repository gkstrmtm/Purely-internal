import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

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
  return key ? key : null;
}

function coerceAgents(raw: unknown): Array<{ id: string; name?: string }> {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as any).agents)
      ? ((raw as any).agents as any[])
      : [];

  const out: Array<{ id: string; name?: string }> = [];
  const seen = new Set<string>();

  for (const a of arr) {
    const rec = a && typeof a === "object" ? (a as any) : null;
    const idRaw = rec?.agent_id ?? rec?.agentId ?? rec?.id;
    const nameRaw = rec?.name ?? rec?.title;

    const id = typeof idRaw === "string" ? idRaw.trim().slice(0, 120) : "";
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const name = typeof nameRaw === "string" ? nameRaw.trim().slice(0, 140) : "";
    out.push({ id, ...(name ? { name } : {}) });
    if (out.length >= 200) break;
  }

  return out;
}

export async function GET() {
  const auth = await requireClientSessionForService("profile");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const apiKey = await getOwnerVoiceAgentApiKey(ownerId);
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing API key. Add it in Portal → Profile." },
      { status: 400 },
    );
  }

  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents", {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      accept: "application/json",
    },
    cache: "no-store",
  }).catch(() => null as any);

  const json = await res?.json?.().catch(() => null);
  if (!res || !res.ok) {
    const msg =
      typeof json?.detail === "string"
        ? json.detail
        : typeof json?.error === "string"
          ? json.error
          : "Unable to list agents";

    return NextResponse.json({ ok: false, error: String(msg || "Unable to list agents").slice(0, 240) }, { status: 502 });
  }

  const agents = coerceAgents(json);
  return NextResponse.json({ ok: true, agents });
}
