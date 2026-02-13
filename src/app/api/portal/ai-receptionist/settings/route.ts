import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import {
  getAiReceptionistServiceData,
  listAiReceptionistEvents,
  parseAiReceptionistSettings,
  regenerateAiReceptionistWebhookToken,
  setAiReceptionistSettings,
  toPublicSettings,
} from "@/lib/aiReceptionist";
import { normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";
import { ensurePortalContactTagsReady, listContactTagsForContact } from "@/lib/portalContactTags";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function upsertContactFromEvent(ownerId: string, input: { name: string; email: string | null; phone: string | null }) {
  const owner = String(ownerId);
  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!name) return null;

  const emailKey = input.email ? normalizeEmailKey(String(input.email)) : null;
  const email = emailKey ? String(input.email).trim().slice(0, 120) : null;

  const phoneNorm = normalizePhoneKey(String(input.phone ?? ""));
  if (phoneNorm.error) return null;
  const phoneKey = phoneNorm.phoneKey;
  const phone = phoneKey ? phoneNorm.phone : null;

  const ors: any[] = [];
  if (phoneKey) ors.push({ phoneKey });
  if (emailKey) ors.push({ emailKey });
  if (!ors.length) return null;

  const existing = await (prisma as any).portalContact.findFirst({
    where: { ownerId: owner, OR: ors },
    select: { id: true, name: true, emailKey: true, phoneKey: true },
  });

  if (existing) {
    const data: any = {};

    // Prefer a real name over placeholder-ish values.
    const existingName = String(existing.name ?? "").trim();
    const existingLooksLikePhone = existingName.startsWith("+") && existingName.length <= 18;
    if (name && (!existingName || existingLooksLikePhone)) {
      data.name = name;
      data.nameKey = normalizeNameKey(name);
    }

    if (!existing.emailKey && emailKey) {
      data.email = email;
      data.emailKey = emailKey;
    }

    if (!existing.phoneKey && phoneKey) {
      data.phone = phone;
      data.phoneKey = phoneKey;
    }

    if (Object.keys(data).length) {
      await (prisma as any).portalContact.update({ where: { id: existing.id }, data, select: { id: true } });
    }

    return String(existing.id);
  }

  const created = await (prisma as any).portalContact.create({
    data: {
      ownerId: owner,
      name,
      nameKey: normalizeNameKey(name),
      email,
      emailKey,
      phone,
      phoneKey,
    },
    select: { id: true },
  });

  return created?.id ? String(created.id) : null;
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  let data = await getAiReceptionistServiceData(ownerId);

  // Best-effort: if the receptionist business name is blank, initialize it from the Business Profile.
  // This keeps onboarding/profile flows from requiring a second manual entry.
  if (!String(data.settings.businessName || "").trim()) {
    const profile = await prisma.businessProfile
      .findUnique({ where: { ownerId }, select: { businessName: true } })
      .catch(() => null);
    const profileName = typeof profile?.businessName === "string" ? profile.businessName.trim() : "";
    if (profileName) {
      try {
        const next = await setAiReceptionistSettings(ownerId, { ...data.settings, businessName: profileName });
        data = { ...data, settings: next };
      } catch {
        // ignore
      }
    }
  }
  const events = await listAiReceptionistEvents(ownerId, 80);

  await ensurePortalContactsSchema().catch(() => null);
  await ensurePortalContactTagsReady().catch(() => null);

  const enrichedEvents = await Promise.all(
    (events || []).map(async (e: any) => {
      const from = String(e?.from ?? "").trim();
      const name = String(e?.contactName ?? "").trim() || from || "Caller";
      const email = typeof e?.contactEmail === "string" && e.contactEmail.trim() ? String(e.contactEmail).trim() : null;
      const phone =
        typeof e?.contactPhone === "string" && e.contactPhone.trim() ? String(e.contactPhone).trim() : from || null;

      let contactId: string | null = null;
      try {
        contactId = await upsertContactFromEvent(ownerId, { name, email, phone });
      } catch {
        contactId = null;
      }

      const contactTags = contactId ? await listContactTagsForContact(ownerId, contactId).catch(() => []) : [];
      return { ...e, contactId, contactTags };
    }),
  );

  const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
  const webhookUrlLegacy = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-receptionist/${data.settings.webhookToken}/voice`,
  );

  const twilio = await getOwnerTwilioSmsConfigMasked(ownerId).catch(() => null);

  return NextResponse.json({
    ok: true,
    settings: toPublicSettings(data.settings),
    events: enrichedEvents,
    webhookUrl,
    webhookUrlLegacy,
    twilioConfigured: Boolean(twilio?.configured),
    twilio: twilio ?? undefined,
    notes: {
      startupChecklist: [
        "In Twilio Console → Phone Numbers → (your number) → Voice & Fax",
        "Set 'A CALL COMES IN' to Webhook (POST)",
        "Paste the Webhook URL from this page",
      ],
    },
  });
}

const putSchema = z.object({
  settings: z.unknown().optional(),
  regenerateToken: z.boolean().optional(),
  clearVoiceAgentKey: z.boolean().optional(),
  clearElevenLabsKey: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.regenerateToken) {
    const next = await regenerateAiReceptionistWebhookToken(ownerId);
    const events = await listAiReceptionistEvents(ownerId, 80);
    const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
    const webhookUrlLegacy = webhookUrlFromRequest(req, `/api/public/twilio/ai-receptionist/${next.webhookToken}/voice`);
    return NextResponse.json({ ok: true, settings: toPublicSettings(next), events, webhookUrl, webhookUrlLegacy });
  }

  const current = await getAiReceptionistServiceData(ownerId);
  const rawSettings = parsed.data.settings ?? {};

  // Preserve secrets unless explicitly cleared or replaced.
  const rawRec = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? (rawSettings as Record<string, unknown>)
    : {};

  if (parsed.data.clearVoiceAgentKey || parsed.data.clearElevenLabsKey) {
    rawRec.voiceAgentApiKey = "";
    // Legacy key name kept for older stored payloads.
    rawRec.elevenLabsApiKey = "";
  }

  const normalized = parseAiReceptionistSettings(rawRec, current.settings);
  const next = await setAiReceptionistSettings(ownerId, normalized);

  const events = await listAiReceptionistEvents(ownerId, 80);
  const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
  const webhookUrlLegacy = webhookUrlFromRequest(req, `/api/public/twilio/ai-receptionist/${next.webhookToken}/voice`);
  return NextResponse.json({ ok: true, settings: toPublicSettings(next), events, webhookUrl, webhookUrlLegacy });
}
