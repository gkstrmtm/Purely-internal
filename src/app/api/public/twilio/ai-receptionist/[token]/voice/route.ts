import { NextResponse } from "next/server";

import {
  findOwnerByAiReceptionistWebhookToken,
  getOwnerProfilePhoneE164,
  upsertAiReceptionistCallEvent,
} from "@/lib/aiReceptionist";
import { getCreditsState } from "@/lib/credits";
import { normalizePhoneStrict } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function xmlEscape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function baseUrlFromRequest(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const lookup = await findOwnerByAiReceptionistWebhookToken(token);
  if (!lookup) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  const ownerId = lookup.ownerId;
  const settings = lookup.data.settings;

  const form = await req.formData().catch(() => null);
  const callSidRaw = form?.get("CallSid");
  const fromRaw = form?.get("From");
  const toRaw = form?.get("To");

  const callSid = typeof callSidRaw === "string" ? callSidRaw : "";
  const from = typeof fromRaw === "string" ? fromRaw : "";
  const to = typeof toRaw === "string" ? toRaw : null;

  if (!callSid || !from) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
  }

  const fromParsed = normalizePhoneStrict(from);
  const fromE164 = fromParsed.ok && fromParsed.e164 ? fromParsed.e164 : from;
  const toParsed = to ? normalizePhoneStrict(to) : null;
  const toE164 = toParsed && toParsed.ok && toParsed.e164 ? toParsed.e164 : to;

  await upsertAiReceptionistCallEvent(ownerId, {
    id: `call_${callSid}`,
    callSid,
    from: fromE164,
    to: toE164,
    createdAtIso: new Date().toISOString(),
    status: "IN_PROGRESS",
  });

  if (!settings.enabled) {
    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "COMPLETED",
      notes: "Disabled",
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Reject/>\n</Response>`;
    return xmlResponse(xml);
  }

  // Simple v1 behavior:
  // - FORWARD: dial the configured forward number (or profile phone)
  // - AI: say a greeting (stub for streaming/agent handoff)

  if (settings.mode === "FORWARD") {
    const profilePhone = await getOwnerProfilePhoneE164(ownerId);
    const forwardTo = settings.forwardToPhoneE164 || profilePhone;

    if (!forwardTo) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>We are unable to take your call right now.</Say>\n  <Hangup/>\n</Response>`;
      return xmlResponse(xml);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">${xmlEscape(forwardTo)}</Dial>
</Response>`;
    return xmlResponse(xml);
  }

  // Credits gate (AI mode): require at least 1 credit to use.
  const credits = await getCreditsState(ownerId).catch(() => null);
  const hasCredit = Boolean(credits && typeof credits.balance === "number" && credits.balance >= 1);
  if (!hasCredit) {
    const profilePhone = await getOwnerProfilePhoneE164(ownerId);
    const forwardTo = settings.forwardToPhoneE164 || profilePhone;

    await upsertAiReceptionistCallEvent(ownerId, {
      id: `call_${callSid}`,
      callSid,
      from: fromE164,
      to: toE164,
      createdAtIso: new Date().toISOString(),
      status: "COMPLETED",
      notes: "Insufficient credits",
    });

    if (forwardTo) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">${xmlEscape(forwardTo)}</Dial>
</Response>`;
      return xmlResponse(xml);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We are unable to take your call right now.</Say>
  <Hangup/>
</Response>`;
    return xmlResponse(xml);
  }

  const greeting = settings.greeting || "Thanks for calling — how can I help?";

  // Charge credits per started minute using Twilio's RecordingDuration callback.
  const base = baseUrlFromRequest(req);
  const recordingAction = `${base}/api/public/twilio/ai-receptionist/${encodeURIComponent(token)}/recording`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${xmlEscape(greeting)}</Say>
  <Pause length="1"/>
  <Say>AI receptionist is not yet fully configured for live conversation. Please leave a message after the beep.</Say>
  <Record action="${xmlEscape(recordingAction)}" method="POST" maxLength="3600" playBeep="true" />
</Response>`;

  return xmlResponse(xml);
}
