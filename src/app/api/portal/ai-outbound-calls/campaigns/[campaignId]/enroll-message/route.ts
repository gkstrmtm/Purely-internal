import crypto from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { normalizeEmailKey, normalizePhoneKey } from "@/lib/portalContacts";
import { recordPortalContactServiceTrigger } from "@/lib/portalContactServiceTriggers";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

const postSchema = z
  .object({
    contactId: z.string().trim().min(1).max(120).optional(),
    target: z.string().trim().min(1).max(200).optional(),
    channelPolicy: z.enum(["SMS", "EMAIL", "BOTH"]).optional(),
  })
  .refine((v) => Boolean(v.contactId || v.target), { message: "contactId or target required" });

async function resolveContactId(ownerId: string, targetRaw: string): Promise<string | null> {
  const target = String(targetRaw || "").trim();
  if (!target) return null;

  // 1) Direct contact ID
  const byId = await (prisma as any).portalContact
    .findFirst({ where: { ownerId, id: target }, select: { id: true } })
    .catch(() => null);
  if (byId?.id) return String(byId.id);

  // 2) Email
  if (target.includes("@")) {
    const emailKey = normalizeEmailKey(target);
    if (!emailKey) return null;
    const byEmail = await (prisma as any).portalContact
      .findFirst({ where: { ownerId, emailKey }, select: { id: true }, orderBy: { updatedAt: "desc" } })
      .catch(() => null);
    if (byEmail?.id) return String(byEmail.id);
    return null;
  }

  // 3) Phone
  const phoneNorm = normalizePhoneKey(target);
  if (!phoneNorm.phoneKey) return null;
  const byPhone = await (prisma as any).portalContact
    .findFirst({ where: { ownerId, phoneKey: phoneNorm.phoneKey }, select: { id: true }, orderBy: { updatedAt: "desc" } })
    .catch(() => null);
  if (byPhone?.id) return String(byPhone.id);

  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const campaignId = idSchema.safeParse(params.campaignId);
  if (!campaignId.success) return NextResponse.json({ ok: false, error: "Invalid campaign id" }, { status: 400 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalAiOutboundCallsSchema();

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: { id: true, status: true, messageChannelPolicy: true },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // UX: manual enrollment is an explicit intent to run the campaign.
  // Auto-activate Draft/Paused campaigns so users don't have to hunt for an activation toggle.
  if (campaign.status === "ARCHIVED") {
    return NextResponse.json({ ok: false, error: "Campaign is archived." }, { status: 400 });
  }

  const now = new Date();
  const activatedCampaign = campaign.status !== "ACTIVE";
  if (activatedCampaign) {
    await prisma.portalAiOutboundCallCampaign
      .update({ where: { id: campaign.id }, data: { status: "ACTIVE", updatedAt: now }, select: { id: true } })
      .catch(() => null);
  }

  const contactId = parsed.data.contactId
    ? String(parsed.data.contactId).trim()
    : await resolveContactId(ownerId, parsed.data.target || "");
  if (!contactId) {
    return NextResponse.json(
      { ok: false, error: "Contact not found. Use a Contact ID, phone number, or email." },
      { status: 404 },
    );
  }

  const channelPolicy = (parsed.data.channelPolicy || (campaign as any).messageChannelPolicy || "BOTH") as
    | "SMS"
    | "EMAIL"
    | "BOTH";

  const existing = await prisma.portalAiOutboundMessageEnrollment
    .findUnique({ where: { campaignId_contactId: { campaignId: campaign.id, contactId } }, select: { id: true, sentFirstMessageAt: true } })
    .catch(() => null);

  if (existing?.id && existing.sentFirstMessageAt) {
    await prisma.portalAiOutboundMessageEnrollment
      .update({
        where: { id: existing.id },
        data: { status: "ACTIVE", source: "MANUAL", channelPolicy, lastError: null },
        select: { id: true },
      })
      .catch(() => null);

    await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);

    return NextResponse.json({ ok: true, enrolled: true, alreadySentFirstMessage: true, activatedCampaign });
  }

  await prisma.portalAiOutboundMessageEnrollment
    .upsert({
      where: { campaignId_contactId: { campaignId: campaign.id, contactId } },
      create: {
        id: crypto.randomUUID(),
        ownerId,
        campaignId: campaign.id,
        contactId,
        status: "QUEUED",
        source: "MANUAL",
        channelPolicy,
        nextSendAt: now,
        sentFirstMessageAt: null,
        threadId: null,
        attemptCount: 0,
        lastError: null,
        pendingReplyToMessageId: null,
        nextReplyAt: null,
        replyAttemptCount: 0,
        replyLastError: null,
        lastAutoRepliedMessageId: null,
        lastAutoReplyAt: null,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        status: "QUEUED",
        source: "MANUAL",
        channelPolicy,
        nextSendAt: now,
        attemptCount: 0,
        lastError: null,
      },
      select: { id: true },
    })
    .catch((e) => {
      throw e;
    });

  await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);

  return NextResponse.json({ ok: true, enrolled: true, alreadySentFirstMessage: false, activatedCampaign });
}
