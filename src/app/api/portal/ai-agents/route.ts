import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";
const AI_RECEPTIONIST_SERVICE_SLUG = "ai-receptionist";

function normalizeAgentId(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  return s.slice(0, 120);
}

function addAgent(
  map: Map<string, { id: string; name?: string }>,
  idRaw: unknown,
  nameRaw?: unknown,
) {
  const id = normalizeAgentId(idRaw);
  if (!id) return;
  if (map.has(id)) return;
  const name = typeof nameRaw === "string" ? nameRaw.trim().slice(0, 140) : "";
  map.set(id, { id, ...(name ? { name } : {}) });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function collectAgentIdsFromJson(value: unknown, out: string[], depth = 0) {
  if (depth > 12) return;
  if (value == null) return;

  if (typeof value === "string") {
    const v = normalizeAgentId(value);
    if (v) out.push(v);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectAgentIdsFromJson(item, out, depth + 1);
    return;
  }

  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      const key = k.toLowerCase();
      const looksLikeAgentIdKey = key === "agentid" || key === "agent_id" || key.endsWith("agentid") || key.endsWith("agent_id");
      if (looksLikeAgentIdKey && typeof v === "string") {
        const id = normalizeAgentId(v);
        if (id) out.push(id);
        continue;
      }
      collectAgentIdsFromJson(v, out, depth + 1);
    }
  }
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

  // IMPORTANT: Do not list agents from ElevenLabs by API key.
  // API keys may be shared across multiple portal accounts.
  // Instead, return only agent IDs that are already referenced by this signed-in owner.
  const agentsMap = new Map<string, { id: string; name?: string }>();

  const setups = await prisma.portalServiceSetup.findMany({
    where: {
      ownerId,
      serviceSlug: { in: [PROFILE_EXTRAS_SERVICE_SLUG, AI_RECEPTIONIST_SERVICE_SLUG] },
    },
    select: { serviceSlug: true, dataJson: true },
  });

  for (const s of setups) {
    const data = asRecord(s.dataJson);

    if (s.serviceSlug === PROFILE_EXTRAS_SERVICE_SLUG) {
      addAgent(agentsMap, data.voiceAgentId, "Profile voice agent");
      continue;
    }

    if (s.serviceSlug === AI_RECEPTIONIST_SERVICE_SLUG) {
      const settings = asRecord((data as any).settings ?? data);
      addAgent(agentsMap, (settings as any).voiceAgentId, "AI Receptionist (voice)");
      addAgent(agentsMap, (settings as any).chatAgentId ?? (settings as any).messagingAgentId, "AI Receptionist (messaging)");
      continue;
    }
  }

  const campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
    where: { ownerId },
    select: { id: true, name: true, voiceAgentId: true, chatAgentId: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });

  for (const c of campaigns) {
    if (c.voiceAgentId) addAgent(agentsMap, c.voiceAgentId, `${c.name} (calls)`);
    if (c.chatAgentId) addAgent(agentsMap, c.chatAgentId, `${c.name} (messages)`);
  }

  const pages = await prisma.creditFunnelPage.findMany({
    where: { funnel: { ownerId } },
    select: { id: true, title: true, blocksJson: true, customChatJson: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  for (const p of pages) {
    const found: string[] = [];
    collectAgentIdsFromJson(p.blocksJson, found);
    collectAgentIdsFromJson(p.customChatJson, found);

    for (const id of found) {
      addAgent(agentsMap, id, p.title ? `Funnel page: ${p.title}` : "Funnel page");
      if (agentsMap.size >= 200) break;
    }
    if (agentsMap.size >= 200) break;
  }

  const agents = Array.from(agentsMap.values()).slice(0, 200);
  agents.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return NextResponse.json({ ok: true, agents });
}
