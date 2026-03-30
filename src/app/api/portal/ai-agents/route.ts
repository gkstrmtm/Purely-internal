import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";
const AI_RECEPTIONIST_SERVICE_SLUG = "ai-receptionist";

function normalizeAgentId(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  const cleaned = s.slice(0, 120);
  // ElevenLabs convai agent ids are `agent_...`
  if (!cleaned.startsWith("agent_")) return "";
  return cleaned;
}

function normalizeLabel(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  return s ? s.slice(0, 160) : "";
}

function pushUnique(list: string[], value: string) {
  if (!value) return;
  if (list.includes(value)) return;
  list.push(value);
}

function addAgent(map: Map<string, { id: string; labels: string[] }>, idRaw: unknown, labelRaw?: unknown) {
  const id = normalizeAgentId(idRaw);
  if (!id) return;
  const label = normalizeLabel(labelRaw);
  const existing = map.get(id);
  if (existing) {
    pushUnique(existing.labels, label);
    return;
  }
  map.set(id, { id, labels: label ? [label] : [] });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function GET(req: Request) {
  const auth = await requireClientSession(req, { apiKeyPermission: "pura.chat" });
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
  const agentsMap = new Map<string, { id: string; labels: string[] }>();

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
      addAgent(agentsMap, data.voiceAgentId, "Profile: Voice");
      continue;
    }

    if (s.serviceSlug === AI_RECEPTIONIST_SERVICE_SLUG) {
      const settings = asRecord((data as any).settings ?? data);
      addAgent(agentsMap, (settings as any).voiceAgentId, "AI Receptionist: Voice");
      addAgent(
        agentsMap,
        (settings as any).chatAgentId ?? (settings as any).messagingAgentId,
        "AI Receptionist: SMS",
      );
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
    const n = normalizeLabel(c.name) || "Outbound campaign";
    if (c.voiceAgentId) addAgent(agentsMap, c.voiceAgentId, `AI Outbound: ${n} (Calls)`);
    if (c.chatAgentId) addAgent(agentsMap, c.chatAgentId, `AI Outbound: ${n} (Messages)`);
  }

  const agents = Array.from(agentsMap.values())
    .map((a) => {
      const label = a.labels.length ? a.labels.join(" · ") : "";
      const name = label ? label.slice(0, 180) : undefined;
      return { id: a.id, ...(name ? { name } : {}) };
    })
    .slice(0, 200);
  agents.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return NextResponse.json({ ok: true, agents });
}
