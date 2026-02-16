import { NextResponse } from "next/server";

import { generateText } from "@/lib/ai";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { prisma } from "@/lib/db";
import { findPortalContactByPhone } from "@/lib/portalContacts";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";
import { findOwnerByAiReceptionistWebhookToken, getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { normalizePhoneStrict } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeTranscript(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  // Keep event JSON compact.
  return s.slice(0, 20000);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const lookup = await findOwnerByAiReceptionistWebhookToken(token);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const ownerId = lookup.ownerId;

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const fromRaw = form?.get("From");
  const toRaw = form?.get("To");
  const recordingSidRaw = form?.get("RecordingSid");

  // Twilio transcription callback commonly includes TranscriptionText/TranscriptionStatus.
  const transcriptionTextRaw = form?.get("TranscriptionText") ?? form?.get("transcription_text") ?? form?.get("Text");
  const transcriptionStatusRaw = form?.get("TranscriptionStatus");

  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";
  const from = typeof fromRaw === "string" ? fromRaw : "";
  const to = typeof toRaw === "string" ? toRaw : null;
  const recordingSid = typeof recordingSidRaw === "string" ? recordingSidRaw : "";
  const transcriptionText = safeTranscript(transcriptionTextRaw);
  const transcriptionStatus = typeof transcriptionStatusRaw === "string" ? transcriptionStatusRaw.trim() : "";

  if (!callSid) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  // Some Twilio transcription callbacks omit From/To. Reuse the stored call event.
  let fromFinal = from;
  let toFinal = to;
  if (!fromFinal) {
    const existing = await getAiReceptionistServiceData(ownerId).catch(() => null);
    const match = existing?.events?.find((e: any) => String(e?.callSid || "") === callSid) as any;
    fromFinal = typeof match?.from === "string" && match.from.trim() ? match.from.trim() : "Unknown";
    toFinal = typeof match?.to === "string" && match.to.trim() ? match.to.trim() : toFinal;
  }

  const fromParsed = normalizePhoneStrict(fromFinal);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : fromFinal;
  const toParsed = toFinal ? normalizePhoneStrict(toFinal) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : toFinal;

  let summary = "";
  let contactName = fromE164;

  // Prefer an existing portal contact name if this number matches a saved contact.
  try {
    const existingContact = fromE164
      ? await findPortalContactByPhone({ ownerId, phone: fromE164 })
      : null;
    if (existingContact?.name) {
      contactName = existingContact.name;
    }
  } catch {
    // Best-effort only; fall back to number/LLM name.
  }
  
  if (transcriptionText) {
    try {
      summary = await generateText({
        system:
          "You are a helpful receptionist assistant. Given a full call transcript, write a single clear takeaway for the business owner.\n" +
          "Focus ONLY on the main reason for the call and what the business needs to do next.\n" +
          "Ignore greetings, small talk, and repeated details.\n" +
          "If the caller's name is mentioned (e.g. 'This is John'), include it. If not, use 'Unknown'.\n" +
          "Return exactly one short sentence under 220 characters, in the format: 'Caller: [Name/Unknown]. Summary: [main takeaway]'.",
        user: `Transcript:\n"${transcriptionText}"`,
      });

      // Simple extraction if the LLM followed format "Caller: ... Summary: ..."
      const nameMatch = summary.match(/Caller:\s*([^.]+)/i);
      if (nameMatch && nameMatch[1]) {
        const potentialName = nameMatch[1].trim();
        if (potentialName.toLowerCase() !== "unknown" && contactName === fromE164) {
          contactName = potentialName;
        }
      }
    } catch (e) {
      console.error("AI summary failed", e);
      summary = transcriptionText.slice(0, 100) + "...";
    }
  }

  const notes = summary
    ? summary
    : !transcriptionText
    ? (transcriptionStatus
        ? `Transcript status: ${transcriptionStatus}`
        : "Transcript callback received.")
    : "";

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "COMPLETED",
    ...(notes ? { notes } : {}),
    ...(recordingSid ? { recordingSid } : {}),
    ...(transcriptionText ? { transcript: transcriptionText } : {}),
    ...(contactName !== fromE164 ? { contactName } : {}),
  });

  // Notifications
  try {
    const settingsData = await getAiReceptionistServiceData(ownerId);
    const settings = settingsData.settings;

    if (settings.enabled) {
      const user = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { email: true, name: true },
      });

      if (user?.email) {
        await trySendTransactionalEmail({
          to: user.email,
          subject: `AI Receptionist handled a call from ${contactName}`,
          text: [
            `Your AI receptionist just handled a call from ${contactName} (${fromE164}).`,
            "",
            "Summary & Context:",
            summary || "(No summary available)",
            "",
            "Transcript:",
            transcriptionText || "(No transcript)",
            "",
            "View details in your portal.",
          ].join("\n"),
        });
      }

      // SMS Notification
      const destinations = new Set<string>();

      // 1. Forwarding Phone (if configured on the AI receptionist)
      if (settings.forwardToPhoneE164) {
        destinations.add(settings.forwardToPhoneE164);
      }

      // 2. User Profile Phone (owner's main contact phone)
      const userProfile = await prisma.portalServiceSetup.findUnique({
        where: {
          ownerId_serviceSlug: {
            ownerId,
            serviceSlug: "profile",
          },
        },
        select: { dataJson: true },
      });
      const userProfileData = userProfile?.dataJson as any;
      if (typeof userProfileData?.phone === "string" && userProfileData.phone.length > 5) {
        destinations.add(userProfileData.phone);
      }

      if (destinations.size === 0) {
        console.info("AI receptionist SMS skipped: no destination phones", { ownerId, callSid });
      }

      await Promise.all(
        [...destinations].map(async (to) => {
          try {
            const res = await sendTwilioEnvSms({
              to,
              body: `Your AI receptionist just handled a call from ${contactName}. Check your email for details.`,
              fromNumberEnvKeys: ["TWILIO_MARKETING_FROM_NUMBER", "TWILIO_FROM_NUMBER"],
            });
            if (!res.ok) {
              console.error("AI receptionist SMS failed", { ownerId, to, reason: res.reason, skipped: (res as any).skipped });
            }
          } catch (e) {
            console.error(`Failed to send AI receptionist SMS to ${to}`, e);
          }
        }),
      );
    }
  } catch (err) {
    console.error("Failed to send receptionist notifications", err);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
