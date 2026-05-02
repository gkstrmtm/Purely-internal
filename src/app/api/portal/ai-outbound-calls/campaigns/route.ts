import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { parseAiOutboundBookingConfig } from "@/lib/aiOutboundBooking";
import { normalizeTagIdList } from "@/lib/portalAiOutboundCalls";
import { parseVoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function normalizeOutcomeRules<T extends string>(raw: unknown, allowedOutcomes: readonly T[]) {
  const allowed = new Set<string>(allowedOutcomes);
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: Array<{ id: string; label: string; outcome: T; matchType: "any" | "contains"; matchText: string; tagIds: string[] }> = [];
  for (const item of arr) {
    const rec = safeRecord(item);
    const id = String(rec.id || "").trim().slice(0, 120);
    const outcome = String(rec.outcome || "").trim().toLowerCase();
    if (!id || !allowed.has(outcome)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const label = String(rec.label || "").trim().slice(0, 80) || `${outcome} rule`;
    const matchType = String(rec.matchType || "contains").trim().toLowerCase() === "any" ? "any" : "contains";
    const matchText = String(rec.matchText || "").trim().slice(0, 240);
    out.push({
      id,
      label,
      outcome: outcome as T,
      matchType,
      matchText,
      tagIds: normalizeTagIdList(rec.tagIds),
    });
    if (out.length >= 25) break;
  }
  return out;
}

function parseCallOutcomeTagging(raw: unknown) {
  const rec = safeRecord(raw);
  return {
    enabled: Boolean(rec.enabled),
    onCompletedTagIds: normalizeTagIdList(rec.onCompletedTagIds),
    onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
    onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
    rules: normalizeOutcomeRules(rec.rules, ["any", "completed", "failed", "skipped"] as const),
  };
}

function parseMessageOutcomeTagging(raw: unknown) {
  const rec = safeRecord(raw);
  return {
    enabled: Boolean(rec.enabled),
    onSentTagIds: normalizeTagIdList(rec.onSentTagIds),
    onFailedTagIds: normalizeTagIdList(rec.onFailedTagIds),
    onSkippedTagIds: normalizeTagIdList(rec.onSkippedTagIds),
    rules: normalizeOutcomeRules(rec.rules, ["any", "sent", "failed", "skipped"] as const),
  };
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  try {
    const url = new URL(req.url);
    const lite = url.searchParams.get("lite") === "1";

    // Backward-compatible fetch:
    // If the DB hasn't applied the latest migration yet, selecting new columns can hard-fail.
    // In that case, retry with an older select so the page can still load.
    let campaigns: Array<any> = [];
    let supportsChatKnowledgeBase = true;
    let supportsBookingConfig = true;
    try {
      campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
        where: { ownerId },
        select: {
          id: true,
          name: true,
          status: true,
          audienceTagIdsJson: true,
          chatAudienceTagIdsJson: true,
          voiceAgentId: true,
          manualVoiceAgentId: true,
          voiceAgentConfigJson: true,
          voiceId: true,
          knowledgeBaseJson: true,
          chatKnowledgeBaseJson: true,
          chatAgentId: true,
          manualChatAgentId: true,
          chatAgentConfigJson: true,
          messageChannelPolicy: true,
          callOutcomeTaggingJson: true,
          messageOutcomeTaggingJson: true,
          bookingConfigJson: true,
          createdAt: true,
          updatedAt: true,
        } as any,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 200,
      });
    } catch {
      supportsChatKnowledgeBase = false;
      supportsBookingConfig = false;
      campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
        where: { ownerId },
        select: {
          id: true,
          name: true,
          status: true,
          audienceTagIdsJson: true,
          chatAudienceTagIdsJson: true,
          voiceAgentId: true,
          manualVoiceAgentId: true,
          voiceAgentConfigJson: true,
          voiceId: true,
          knowledgeBaseJson: true,
          chatAgentId: true,
          manualChatAgentId: true,
          chatAgentConfigJson: true,
          messageChannelPolicy: true,
          callOutcomeTaggingJson: true,
          messageOutcomeTaggingJson: true,
          createdAt: true,
          updatedAt: true,
        } as any,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 200,
      });
    }

    const campaignIds = campaigns.map((c) => c.id);
    const enrollAgg = lite
      ? []
      : await (async () => {
          if (!campaignIds.length) return [];
          try {
            return await prisma.portalAiOutboundCallEnrollment.groupBy({
              by: ["campaignId", "status"],
              where: { ownerId, campaignId: { in: campaignIds } },
              _count: { _all: true },
            });
          } catch {
            return [];
          }
        })();

    const countsByCampaign = new Map<string, { queued: number; completed: number }>();
    for (const row of enrollAgg) {
      const campaignId = String(row.campaignId);
      const status = String((row as any).status);
      const count = Number((row as any)?._count?._all ?? 0);
      const next = countsByCampaign.get(campaignId) ?? { queued: 0, completed: 0 };
      if (status === "QUEUED") next.queued += count;
      if (status === "COMPLETED") next.completed += count;
      countsByCampaign.set(campaignId, next);
    }

    return NextResponse.json({
      ok: true,
      campaigns: campaigns.map((c) => {
        const counts = countsByCampaign.get(String(c.id)) ?? { queued: 0, completed: 0 };
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          audienceTagIds: normalizeTagIdList(c.audienceTagIdsJson),
          chatAudienceTagIds: normalizeTagIdList(c.chatAudienceTagIdsJson),
          voiceAgentId: c.voiceAgentId ? String(c.voiceAgentId) : "",
          manualVoiceAgentId: (c as any).manualVoiceAgentId ? String((c as any).manualVoiceAgentId) : "",
          voiceAgentConfig: parseVoiceAgentConfig(c.voiceAgentConfigJson),
          voiceId: typeof (c as any).voiceId === "string" ? String((c as any).voiceId) : "",
          knowledgeBase: (c as any).knowledgeBaseJson ?? null,
          messagesKnowledgeBase: supportsChatKnowledgeBase ? (c as any).chatKnowledgeBaseJson ?? null : null,
          chatAgentId: c.chatAgentId ? String(c.chatAgentId) : "",
          manualChatAgentId: (c as any).manualChatAgentId ? String((c as any).manualChatAgentId) : "",
          chatAgentConfig: parseVoiceAgentConfig(c.chatAgentConfigJson),
          messageChannelPolicy: String((c as any).messageChannelPolicy || "BOTH"),
          callOutcomeTagging: parseCallOutcomeTagging((c as any).callOutcomeTaggingJson),
          messageOutcomeTagging: parseMessageOutcomeTagging((c as any).messageOutcomeTaggingJson),
          bookingConfig: supportsBookingConfig
            ? parseAiOutboundBookingConfig((c as any).bookingConfigJson)
            : { enabled: false, calendarId: null },
          createdAtIso: c.createdAt.toISOString(),
          updatedAtIso: c.updatedAt.toISOString(),
          enrollQueued: counts.queued,
          enrollCompleted: counts.completed,
        };
      }),
    });
  } catch (error) {
    console.error("[ai-outbound-campaigns] failed to load campaigns", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error && error.message ? error.message : "Failed to load campaigns",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const now = new Date();
  const id = crypto.randomUUID();
  const name = parsed.data.name?.trim() || "New campaign";

  try {
    await prisma.portalAiOutboundCallCampaign.create({
      data: {
        id,
        ownerId,
        name,
        status: "DRAFT",
        script: "",
        audienceTagIdsJson: [],
        chatAudienceTagIdsJson: [],
        voiceAgentId: null,
        chatAgentId: null,
        messageChannelPolicy: "BOTH",
        bookingConfigJson: { enabled: false, calendarId: null },
        createdAt: now,
        updatedAt: now,
      } as any,
      select: { id: true },
    });
  } catch {
    await prisma.portalAiOutboundCallCampaign.create({
      data: {
        id,
        ownerId,
        name,
        status: "DRAFT",
        script: "",
        audienceTagIdsJson: [],
        chatAudienceTagIdsJson: [],
        voiceAgentId: null,
        chatAgentId: null,
        messageChannelPolicy: "BOTH",
        createdAt: now,
        updatedAt: now,
      } as any,
      select: { id: true },
    });
  }

  return NextResponse.json({ ok: true, id });
}
