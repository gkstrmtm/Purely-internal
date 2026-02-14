import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";

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
  return s.slice(0, 20000);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const t = String(token || "").trim();
  if (!t) return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");

  await ensurePortalAiOutboundCallsSchema();

  const manual = await prisma.portalAiOutboundCallManualCall.findFirst({
    where: { webhookToken: t },
    select: { id: true },
  });

  if (!manual) {
    return xmlResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }

  const form = await req.formData().catch(() => null);
  const transcriptionTextRaw = form?.get("TranscriptionText") ?? form?.get("transcription_text") ?? form?.get("Text");
  const transcriptionStatusRaw = form?.get("TranscriptionStatus");

  const transcriptionText = safeTranscript(transcriptionTextRaw);
  const transcriptionStatus = typeof transcriptionStatusRaw === "string" ? transcriptionStatusRaw.trim() : "";

  await prisma.portalAiOutboundCallManualCall.update({
    where: { id: manual.id },
    data: {
      ...(transcriptionText ? { transcriptText: transcriptionText, lastError: null } : {}),
      ...(!transcriptionText && transcriptionStatus ? { lastError: `Transcript status: ${transcriptionStatus}`.slice(0, 500) } : {}),
    },
    select: { id: true },
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

  return xmlResponse(xml);
}
