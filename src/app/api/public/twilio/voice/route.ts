import { NextResponse } from "next/server";

import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { getMissedCallTextBackServiceData } from "@/lib/missedCallTextBack";
import { findOwnerIdByTwilioToNumber } from "@/lib/twilioRouting";

import { POST as aiReceptionistVoicePOST } from "@/app/api/public/twilio/ai-receptionist/[token]/voice/route";
import { POST as missedCallVoicePOST } from "@/app/api/public/twilio/missed-call-textback/[token]/voice/route";

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

function rejectXml() {
  return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Reject/></Response>");
}

export async function POST(req: Request) {
  const parseReq = req.clone();
  const forwardReq = req.clone();

  const form = await parseReq.formData().catch(() => null);
  const toRaw = form?.get("To");
  const to = typeof toRaw === "string" ? toRaw.trim() : "";
  if (!to) return rejectXml();

  const ownerId = await findOwnerIdByTwilioToNumber(to);
  if (!ownerId) return rejectXml();

  const [ai, missed] = await Promise.all([
    getAiReceptionistServiceData(ownerId).catch(() => null),
    getMissedCallTextBackServiceData(ownerId).catch(() => null),
  ]);

  // Precedence: AI receptionist first, then missed-call textback.
  if (ai?.settings?.enabled && ai.settings.webhookToken) {
    return await aiReceptionistVoicePOST(forwardReq, {
      params: Promise.resolve({ token: ai.settings.webhookToken }),
    });
  }

  if (missed?.settings?.enabled && missed.settings.webhookToken) {
    return await missedCallVoicePOST(forwardReq, {
      params: Promise.resolve({ token: missed.settings.webhookToken }),
    });
  }

  return rejectXml();
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
