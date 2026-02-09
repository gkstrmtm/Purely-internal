import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function wavSineTone(opts: { seconds: number; hz: number; sampleRate: number; amplitude: number }): Uint8Array {
  const seconds = Math.max(0.2, Math.min(6, Number.isFinite(opts.seconds) ? opts.seconds : 1));
  const hz = Math.max(100, Math.min(1200, Number.isFinite(opts.hz) ? opts.hz : 440));
  const sampleRate = Math.max(8000, Math.min(48000, Math.floor(opts.sampleRate || 8000)));
  const amplitude = Math.max(0.05, Math.min(0.6, Number.isFinite(opts.amplitude) ? opts.amplitude : 0.25));

  const numSamples = Math.floor(sampleRate * seconds);
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  const writeAscii = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };

  writeAscii("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeAscii("WAVE");
  writeAscii("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitsPerSample, true);
  offset += 2;
  writeAscii("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const twoPi = 2 * Math.PI;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(twoPi * hz * t);
    const env = Math.min(1, i / (sampleRate * 0.03), (numSamples - i) / (sampleRate * 0.06));
    const v = Math.max(-1, Math.min(1, sample * amplitude * Math.max(0, env)));
    view.setInt16(offset, Math.round(v * 32767), true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const { id } = await ctx.params;
  const clean = (id || "").trim().slice(0, 40);

  const toneHz = clean.includes("2") ? 523.25 : clean.includes("3") ? 659.25 : 440;
  const bytes = wavSineTone({ seconds: 2.2, hz: toneHz, sampleRate: 8000, amplitude: 0.25 });
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="demo-call-${clean || "audio"}.wav"`,
    },
  });
}
