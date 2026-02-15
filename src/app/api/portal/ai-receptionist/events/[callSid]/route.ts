import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { deleteAiReceptionistCallEvent, getAiReceptionistServiceData, upsertAiReceptionistCallEvent } from "@/lib/aiReceptionist";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { transcribeAudio, transcribeAudioVerbose } from "@/lib/ai";
import { buildSpeakerTranscriptAlignedToFull } from "@/lib/dualChannelTranscript";
import { splitStereoPcmWavToMonoWavs } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function twilioBasicAuthHeader(cfg: { accountSid: string; authToken: string }): string {
  const basic = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  return `Basic ${basic}`;
}

async function fetchTwilioRecordingAudio(
  ownerId: string,
  recordingSid: string,
  ext: "mp3" | "wav",
): Promise<{ ok: true; bytes: ArrayBuffer; mimeType: string } | { ok: false; error: string }> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return { ok: false, error: "Missing recording sid" };

  const config = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!config) return { ok: false, error: "Twilio is not configured for this account" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}.${ext}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(cfgFromTwilio(config)) },
    cache: "no-store",
  }).catch(() => null as any);

  if (!res || typeof res.ok !== "boolean") return { ok: false, error: "Unable to fetch recording" };
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Unable to fetch recording (${res.status}). ${body}`.slice(0, 300) };
  }

  const bytes = await res.arrayBuffer();
  const size = bytes?.byteLength ?? 0;
  if (size <= 0) return { ok: false, error: "Recording is empty" };
  if (size > 24 * 1024 * 1024) return { ok: false, error: "Recording too large to transcribe automatically." };

  const mimeType = res.headers.get("content-type") || (ext === "wav" ? "audio/wav" : "audio/mpeg");
  return { ok: true, bytes, mimeType };
}

function cfgFromTwilio(twilio: any): { accountSid: string; authToken: string } {
  return { accountSid: String(twilio.accountSid || ""), authToken: String(twilio.authToken || "") };
}

export async function POST(req: Request, ctx: { params: Promise<{ callSid: string }> }) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { callSid } = await ctx.params;
  const ownerId = auth.session.user.id;
  const sid = String(callSid || "").trim();
  if (!sid) return NextResponse.json({ ok: false, error: "Missing call sid" }, { status: 400 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const data = await getAiReceptionistServiceData(ownerId);
  const event = (data.events || []).find((e: any) => String(e?.callSid || "").trim() === sid) as any;
  if (!event) return NextResponse.json({ ok: false, error: "Call not found" }, { status: 404 });

  const recordingSid = String(event?.recordingSid || "").trim();
  if (!recordingSid) return NextResponse.json({ ok: false, error: "No recording available for this call" }, { status: 400 });

  const existing = String(event?.transcript || "").trim();
  if (existing && !force) return NextResponse.json({ ok: true, transcript: existing });

  try {
    const wav = await fetchTwilioRecordingAudio(ownerId, recordingSid, "wav");
    const mp3 = await fetchTwilioRecordingAudio(ownerId, recordingSid, "mp3");

    let transcript = "";

    if (wav.ok) {
      const split = splitStereoPcmWavToMonoWavs(wav.bytes);
      const [left, right, full] = await Promise.all([
        transcribeAudioVerbose({ bytes: split.leftWav, filename: `${recordingSid}-left.wav`, mimeType: "audio/wav" }),
        transcribeAudioVerbose({ bytes: split.rightWav, filename: `${recordingSid}-right.wav`, mimeType: "audio/wav" }),
        mp3.ok
          ? transcribeAudioVerbose({ bytes: mp3.bytes, filename: `${recordingSid}.mp3`, mimeType: mp3.mimeType || "audio/mpeg" })
          : Promise.resolve({ text: "", segments: [] }),
      ]);

      transcript = buildSpeakerTranscriptAlignedToFull({
        full,
        left,
        right,
        leftLabel: "Recipient",
        rightLabel: "Agent",
        maxChars: 20000,
      });
    }

    if (!transcript.trim() && mp3.ok) {
      const text = await transcribeAudio({ bytes: mp3.bytes, filename: `${recordingSid}.mp3`, mimeType: mp3.mimeType || "audio/mpeg" });
      transcript = String(text || "").trim().slice(0, 20000);
    }

    if (!transcript.trim()) {
      return NextResponse.json({ ok: false, error: "Unable to generate transcript yet" }, { status: 502 });
    }

    await upsertAiReceptionistCallEvent(ownerId, {
      id: String(event?.id || `call_${sid}`),
      callSid: sid,
      from: String(event?.from || "Unknown"),
      to: typeof event?.to === "string" ? event.to : null,
      createdAtIso: String(event?.createdAtIso || new Date().toISOString()),
      status: event?.status === "IN_PROGRESS" || event?.status === "FAILED" || event?.status === "UNKNOWN" ? event.status : "COMPLETED",
      ...(recordingSid ? { recordingSid } : {}),
      transcript,
    });

    return NextResponse.json({ ok: true, transcript });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unable to generate transcript";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ callSid: string }> }) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const { callSid } = await ctx.params;
  const ownerId = auth.session.user.id;

  const res = await deleteAiReceptionistCallEvent(ownerId, callSid);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "Call not found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
