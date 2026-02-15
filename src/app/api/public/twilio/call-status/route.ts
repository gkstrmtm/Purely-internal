import { NextResponse } from "next/server";

import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { findOwnerIdByTwilioToNumber } from "@/lib/twilioRouting";

import { POST as aiReceptionistCallStatusPOST } from "@/app/api/public/twilio/ai-receptionist/[token]/call-status/route";

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

function hangupXml() {
  return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
}

function getToFromForm(form: FormData | null): string {
  if (!form) return "";
  const toRaw = form.get("To") ?? form.get("Called");
  return typeof toRaw === "string" ? toRaw.trim() : "";
}

export async function POST(req: Request) {
  const parseReq = req.clone();
  const forwardReq = req.clone();

  const form = await parseReq.formData().catch(() => null);
  const to = getToFromForm(form);
  if (!to) return hangupXml();

  const ownerId = await findOwnerIdByTwilioToNumber(to);
  if (!ownerId) return hangupXml();

  const ai = await getAiReceptionistServiceData(ownerId).catch(() => null);
  if (ai?.settings?.enabled && ai.settings.webhookToken) {
    return await aiReceptionistCallStatusPOST(forwardReq, {
      params: Promise.resolve({ token: ai.settings.webhookToken }),
    });
  }

  return hangupXml();
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
