import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { runOwnerAutomationByIdForEvent } from "@/lib/portalAutomationsRunner";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const triggerKindSchema = z.enum([
  "manual",
  "inbound_sms",
  "inbound_mms",
  "inbound_call",
  "inbound_email",
  "form_submitted",
  "new_lead",
  "lead_scraped",
  "tag_added",
  "contact_created",
  "task_added",
  "inbound_webhook",
  "scheduled_time",
  "missed_appointment",
  "appointment_ended",
  "appointment_booked",
  "missed_call",
  "review_received",
  "follow_up_sent",
  "outbound_sent",
]);

const bodySchema = z.object({
  automationId: z.string().trim().min(1).max(200),
  triggerKind: triggerKindSchema,
  from: z.string().trim().max(200).optional().default(""),
  body: z.string().trim().max(2000).optional().default(""),
  nowIso: z.string().trim().max(64).optional(),
  contact: z
    .object({
      id: z.string().trim().max(80).optional(),
      name: z.string().trim().max(200).optional(),
      email: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(32).optional(),
    })
    .optional(),
  event: z
    .object({
      tagId: z.string().trim().max(120).optional(),
      webhookKey: z.string().trim().max(200).optional(),
      triggerNodeId: z.string().trim().max(200).optional(),
      bookingId: z.string().trim().max(120).optional(),
      calendarId: z.string().trim().max(120).optional(),
      leadId: z.string().trim().max(120).optional(),
      formId: z.string().trim().max(120).optional(),
      formSlug: z.string().trim().max(160).optional(),
      formName: z.string().trim().max(160).optional(),
      submissionId: z.string().trim().max(160).optional(),
      formData: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function looksLikePhone(value: string) {
  return /\+?[0-9][0-9()\-\s]{6,}/.test(value.trim());
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("automations");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const triggerKind = parsed.data.triggerKind;
  const from = String(parsed.data.from || "").trim();
  const isPhoneTrigger = triggerKind === "inbound_sms" || triggerKind === "inbound_mms" || triggerKind === "inbound_call" || triggerKind === "missed_call";
  const isEmailTrigger = triggerKind === "inbound_email";
  if ((isPhoneTrigger || isEmailTrigger) && !from) {
    return NextResponse.json({ ok: false, error: "Sender is required for this trigger." }, { status: 400 });
  }

  const defaultContact = from
    ? {
        phone: looksLikePhone(from) ? from : undefined,
        email: looksLikeEmail(from) ? from : undefined,
        name: from,
      }
    : undefined;

  const twilio = isPhoneTrigger ? await getOwnerTwilioSmsConfig(ownerId).catch(() => null) : null;

  try {
    await runOwnerAutomationByIdForEvent({
      ownerId,
      automationId: parsed.data.automationId,
      triggerKind,
      throwIfMissing: true,
      nowIso: parsed.data.nowIso,
      message: isPhoneTrigger || isEmailTrigger ? { from, to: twilio?.fromNumberE164 || "", body: parsed.data.body || "" } : undefined,
      contact: parsed.data.contact ?? defaultContact,
      event: parsed.data.event,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    const safeMessage = message.trim().slice(0, 200);
    const status = /not found/i.test(safeMessage) ? 404 : 400;
    return NextResponse.json({ ok: false, error: safeMessage || "Test failed" }, { status });
  }
}