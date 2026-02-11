import crypto from "crypto";

import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import { renderTextTemplate } from "@/lib/textTemplate";
import { recordPortalContactServiceTrigger } from "@/lib/portalContactServiceTriggers";

export type AiOutboundCallCampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

export function normalizeTagIdList(raw: unknown): string[] {
  const xs = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const x of xs) {
    const id = typeof x === "string" ? x.trim() : "";
    if (!id) continue;
    if (id.length > 120) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= 50) break;
  }
  return out;
}

function xmlEscape(s: string) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function enqueueOutboundCallForTaggedContact(opts: {
  ownerId: string;
  contactId: string;
  tagId: string;
}): Promise<{ ok: true; enqueued: number } | { ok: false; error: string }> {
  const ownerId = String(opts.ownerId || "").trim();
  const contactId = String(opts.contactId || "").trim();
  const tagId = String(opts.tagId || "").trim();
  if (!ownerId || !contactId || !tagId) return { ok: true, enqueued: 0 };

  await ensurePortalAiOutboundCallsSchema();

  const campaigns = await prisma.portalAiOutboundCallCampaign.findMany({
    where: { ownerId, status: "ACTIVE" },
    select: { id: true, audienceTagIdsJson: true },
    take: 200,
  });

  const matched = campaigns.filter((c) => {
    const tags = normalizeTagIdList(c.audienceTagIdsJson);
    return tags.includes(tagId);
  });

  if (!matched.length) return { ok: true, enqueued: 0 };

  const now = new Date();
  let enqueued = 0;

  for (const c of matched) {
    try {
      await prisma.portalAiOutboundCallEnrollment.create({
        data: {
          id: crypto.randomUUID(),
          ownerId,
          campaignId: c.id,
          contactId,
          status: "QUEUED",
          nextCallAt: now,
          attemptCount: 0,
          lastError: null,
          completedAt: null,
          updatedAt: now,
          createdAt: now,
        },
        select: { id: true },
      });
      enqueued += 1;
    } catch (e: any) {
      const code = typeof e?.code === "string" ? e.code : "";
      if (code === "P2002") continue;
      // Best-effort: ignore other errors to avoid breaking tag assignment.
      continue;
    }
  }

  if (enqueued > 0) {
    await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);
  }

  return { ok: true, enqueued };
}

export async function enqueueOutboundCallForContact(opts: {
  ownerId: string;
  contactId: string;
  campaignId?: string;
}): Promise<{ ok: true; enrollmentId?: string } | { ok: false; error: string }> {
  const ownerId = String(opts.ownerId || "").trim();
  const contactId = String(opts.contactId || "").trim();
  const campaignIdRaw = String(opts.campaignId || "").trim();
  if (!ownerId || !contactId) return { ok: false, error: "Missing owner/contact" };

  await ensurePortalAiOutboundCallsSchema();

  const campaign = campaignIdRaw
    ? await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId, id: campaignIdRaw },
        select: { id: true },
      })
    : await prisma.portalAiOutboundCallCampaign.findFirst({
        where: { ownerId, status: "ACTIVE" },
        select: { id: true },
        orderBy: [{ updatedAt: "desc" }],
      });

  if (!campaign?.id) return { ok: false, error: "No campaign found" };

  const now = new Date();
  const id = crypto.randomUUID();
  try {
    await prisma.portalAiOutboundCallEnrollment.create({
      data: {
        id,
        ownerId,
        campaignId: campaign.id,
        contactId,
        status: "QUEUED",
        nextCallAt: now,
        attemptCount: 0,
        lastError: null,
        completedAt: null,
        updatedAt: now,
        createdAt: now,
      },
      select: { id: true },
    });
    await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);
    return { ok: true, enrollmentId: id };
  } catch (e: any) {
    const code = typeof e?.code === "string" ? e.code : "";
    if (code === "P2002") {
      await recordPortalContactServiceTrigger({ ownerId, contactId, serviceSlug: "ai-outbound-calls" }).catch(() => null);
      return { ok: true };
    }
    return { ok: false, error: "Failed to enqueue" };
  }
}

export async function placeTwilioOutboundCall(opts: {
  ownerId: string;
  toE164: string;
  script: string;
}): Promise<{ ok: true; callSid?: string } | { ok: false; error: string }> {
  const ownerId = String(opts.ownerId || "").trim();
  const to = String(opts.toE164 || "").trim();
  const script = String(opts.script || "");
  if (!ownerId || !to) return { ok: false, error: "Missing owner/to" };

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return { ok: false, error: "Twilio not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="Polly.Joanna">${xmlEscape(script)}</Say>\n  <Pause length="1"/>\n  <Record maxLength="3600" playBeep="true"/>\n</Response>`;

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", config.fromNumberE164);
  form.set("Twiml", twiml);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, error: `Twilio failed (${res.status}): ${text.slice(0, 400)}` };
  }

  try {
    const json = JSON.parse(text) as any;
    const callSid = typeof json?.sid === "string" ? json.sid : undefined;
    return { ok: true, callSid };
  } catch {
    return { ok: true };
  }
}

export async function renderCampaignScript(opts: {
  ownerId: string;
  contact: { id: string; name: string | null; email: string | null; phone: string | null };
  campaign: { script: string };
}): Promise<string> {
  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: opts.ownerId }, select: { businessName: true } })
    .catch(() => null);
  const ownerUser = await prisma.user
    .findUnique({ where: { id: opts.ownerId }, select: { email: true, name: true } })
    .catch(() => null);

  const vars = buildPortalTemplateVars({
    contact: {
      id: opts.contact.id,
      name: opts.contact.name,
      email: opts.contact.email,
      phone: opts.contact.phone,
    },
    business: { name: profile?.businessName?.trim() || "Purely Automation" },
    owner: {
      name: ownerUser?.name?.trim() || null,
      email: ownerUser?.email?.trim() || null,
      phone: null,
    },
    message: { body: "" },
  });

  const raw = String(opts.campaign.script || "").trim();
  if (!raw) return "Hi — this is an automated call. Please call us back when you have a moment.";

  return renderTextTemplate(raw, vars).trim().slice(0, 1800);
}
