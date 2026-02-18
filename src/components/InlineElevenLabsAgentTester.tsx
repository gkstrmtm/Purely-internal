"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parsePcmSampleRate(format: string | null | undefined): number | null {
  const raw = typeof format === "string" ? format.trim().toLowerCase() : "";
  const m = raw.match(/^pcm_(\d{4,6})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input;
  if (!Number.isFinite(inRate) || !Number.isFinite(outRate) || inRate <= 0 || outRate <= 0) return input;

  const ratio = outRate / inRate;
  const outLen = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = src - i0;
    const a = input[i0] ?? 0;
    const b = input[i1] ?? 0;
    out[i] = a + (b - a) * t;
  }
  return out;
}

function pcm16leBytesFromFloat32(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    dv.setInt16(i * 2, v, true);
  }
  return out;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function InlineElevenLabsAgentTester(props: {
  agentId: string | null | undefined;
  className?: string;
}) {
  const agentId = useMemo(() => (typeof props.agentId === "string" ? props.agentId.trim() : ""), [props.agentId]);

  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agentOutputFormat, setAgentOutputFormat] = useState<string | null>(null);
  const [userInputFormat, setUserInputFormat] = useState<string | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);

  const outCtxRef = useRef<AudioContext | null>(null);
  const outNextTimeRef = useRef<number>(0);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);

  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const canConnect = Boolean(agentId);

  useEffect(() => {
    if (status !== "connected" || !callStartedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [callStartedAt, status]);

  const disconnect = useCallback(() => {
    setError(null);
    setConversationId(null);
    setAgentOutputFormat(null);
    setUserInputFormat(null);
    setCallStartedAt(null);

    try {
      micProcessorRef.current?.disconnect();
      micSourceRef.current?.disconnect();
    } catch {
      // ignore
    }

    try {
      micCtxRef.current?.close();
    } catch {
      // ignore
    }
    micCtxRef.current = null;
    micProcessorRef.current = null;
    micSourceRef.current = null;

    try {
      micStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    micStreamRef.current = null;
    setMicEnabled(false);

    try {
      outCtxRef.current?.close();
    } catch {
      // ignore
    }
    outCtxRef.current = null;
    outNextTimeRef.current = 0;

    const ws = wsRef.current;
    wsRef.current = null;

    try {
      ws?.close();
    } catch {
      // ignore
    }

    setStatus("disconnected");
  }, []);

  const ensureOutputAudioContext = useCallback(async () => {
    if (outCtxRef.current) return outCtxRef.current;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    outCtxRef.current = ctx;
    outNextTimeRef.current = ctx.currentTime;
    return ctx;
  }, []);

  const playIncomingAudioChunk = useCallback(
    async (b64: string) => {
      if (!speakerEnabled) return;
      const ctx = await ensureOutputAudioContext();

      // Some browsers start AudioContext suspended until a user gesture.
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // ignore
        }
      }

      const fmt = agentOutputFormat;
      const pcmRate = parsePcmSampleRate(fmt);
      const bytes = bytesFromBase64(b64);

      if (pcmRate) {
        // PCM16 little-endian
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const sampleCount = Math.floor(bytes.byteLength / 2);
        const buffer = ctx.createBuffer(1, sampleCount, pcmRate);
        const ch = buffer.getChannelData(0);
        for (let i = 0; i < sampleCount; i++) {
          const v = dv.getInt16(i * 2, true);
          ch[i] = v / 0x8000;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        const startAt = Math.max(ctx.currentTime, outNextTimeRef.current);
        source.start(startAt);
        outNextTimeRef.current = startAt + buffer.duration;
        return;
      }

      // Fallback: try letting the browser decode (e.g., mp3/wav)
      try {
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const asArrayBuffer = ab instanceof ArrayBuffer ? ab : new Uint8Array(ab as any).buffer;
        const decoded = await ctx.decodeAudioData(asArrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime, outNextTimeRef.current);
        source.start(startAt);
        outNextTimeRef.current = startAt + decoded.duration;
      } catch {
        // ignore
      }
    },
    [agentOutputFormat, ensureOutputAudioContext, speakerEnabled],
  );

  const enableMic = useCallback(async () => {
    if (micEnabled) return;
    setError(null);

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Not connected. Click Connect first.");
      return;
    }

    // Default input PCM format is typically pcm_16000. If server reports otherwise, honor it.
    const inRate = parsePcmSampleRate(userInputFormat) ?? 16000;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        } as any,
      });
    } catch {
      setError("Microphone permission denied.");
      return;
    }

    micStreamRef.current = stream;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    micCtxRef.current = ctx;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // ignore
      }
    }

    const source = ctx.createMediaStreamSource(stream);
    micSourceRef.current = source;

    // ScriptProcessorNode is deprecated but widely supported and sufficient for MVP.
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    micProcessorRef.current = processor;

    processor.onaudioprocess = (ev) => {
      const wsNow = wsRef.current;
      if (!wsNow || wsNow.readyState !== WebSocket.OPEN) return;

      const input = ev.inputBuffer.getChannelData(0);
      const resampled = resampleLinear(input, ctx.sampleRate, inRate);
      const pcmBytes = pcm16leBytesFromFloat32(resampled);
      const b64 = base64FromBytes(pcmBytes);

      // API reference example sends `{"user_audio_chunk":"..."}` without an explicit `type`.
      try {
        wsNow.send(JSON.stringify({ user_audio_chunk: b64 }));
      } catch {
        // ignore
      }
    };

    // Keep processor alive (some browsers require connecting to destination).
    source.connect(processor);
    processor.connect(ctx.destination);

    setMicEnabled(true);
  }, [micEnabled, userInputFormat]);

  const disableMic = useCallback(() => {
    try {
      micProcessorRef.current?.disconnect();
      micSourceRef.current?.disconnect();
    } catch {
      // ignore
    }

    try {
      micCtxRef.current?.close();
    } catch {
      // ignore
    }

    try {
      micStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {
      // ignore
    }

    micCtxRef.current = null;
    micProcessorRef.current = null;
    micSourceRef.current = null;
    micStreamRef.current = null;

    setMicEnabled(false);
  }, []);

  const connect = useCallback(async () => {
    if (!canConnect) return;
    if (status === "connecting" || status === "connected") return;

    setError(null);
    setConversationId(null);
    setStatus("connecting");

    const signedUrlRes = await fetch("/api/portal/elevenlabs/convai/signed-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId }),
    }).catch(() => null as any);

    const signedUrlJson = (await signedUrlRes?.json?.().catch(() => null)) as any;
    const signedUrl = typeof signedUrlJson?.signedUrl === "string" ? signedUrlJson.signedUrl : null;

    if (!signedUrlRes || !signedUrlRes.ok || !signedUrl) {
      setStatus("disconnected");
      setError(signedUrlJson?.error || "Failed to start session");
      return;
    }

    const ws = new WebSocket(signedUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setCallStartedAt(Date.now());

      // Kick off the conversation using the server-side agent config.
      ws.send(JSON.stringify({ type: "conversation_initiation_client_data" }));

      // The user clicked Call, so start the mic immediately.
      void enableMic();
    };

    ws.onclose = () => {
      // If the current ref isn't this socket, we already reconnected.
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setStatus("disconnected");
      setCallStartedAt(null);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setError("WebSocket error");
    };

    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
      if (!data) return;

      const type = typeof data?.type === "string" ? data.type : "";

      if (type === "ping") {
        const eventId = data?.ping_event?.event_id;
        ws.send(JSON.stringify({ type: "pong", event_id: eventId }));
        return;
      }

      if (type === "conversation_initiation_metadata") {
        const id = typeof data?.conversation_initiation_metadata_event?.conversation_id === "string"
          ? data.conversation_initiation_metadata_event.conversation_id
          : null;
        if (id) setConversationId(id);

        const outFmt = typeof data?.conversation_initiation_metadata_event?.agent_output_audio_format === "string"
          ? data.conversation_initiation_metadata_event.agent_output_audio_format
          : null;
        const inFmt = typeof data?.conversation_initiation_metadata_event?.user_input_audio_format === "string"
          ? data.conversation_initiation_metadata_event.user_input_audio_format
          : null;
        if (outFmt) setAgentOutputFormat(outFmt);
        if (inFmt) setUserInputFormat(inFmt);
        return;
      }

      if (type === "audio") {
        const b64 =
          (typeof data?.audio_event?.audio_base_64 === "string" ? data.audio_event.audio_base_64 : "") ||
          (typeof data?.audio_base_64 === "string" ? data.audio_base_64 : "");
        if (b64) void playIncomingAudioChunk(b64);
        return;
      }
    };
  }, [agentId, canConnect, enableMic, playIncomingAudioChunk, status]);

  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    };
  }, []);

  if (!agentId) {
    return (
      <div className={props.className ?? ""}>
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          No ElevenLabs agent ID configured.
        </div>
      </div>
    );
  }

  return (
    <div className={props.className ?? ""}>
      <div className="rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                "h-2.5 w-2.5 rounded-full",
                status === "connected" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-500" : "bg-zinc-300",
              )}
            />
            <div className="text-sm font-semibold text-zinc-900">Test call</div>
            {callStartedAt && status === "connected" ? (
              <div className="text-xs font-semibold text-zinc-500">{formatDuration(now - callStartedAt)}</div>
            ) : null}
          </div>

          <button
            type="button"
            className={classNames(
              "rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60",
              speakerEnabled ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" : "border-zinc-200 bg-zinc-900 text-white",
            )}
            disabled={status !== "connected"}
            onClick={() => setSpeakerEnabled((v) => !v)}
            title={speakerEnabled ? "Mute" : "Unmute"}
          >
            {speakerEnabled ? "Mute" : "Unmute"}
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="mt-5 flex items-center justify-center">
          {status === "connected" ? (
            <button
              type="button"
              onClick={() => disconnect()}
              className="group flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600/50"
              title="Hang up"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4.2 10.8c1.6-1 3.8-1.8 7.8-1.8s6.2.8 7.8 1.8c.9.6 1.2 1.8.6 2.7l-1.1 1.7c-.4.6-1.2.9-1.9.7l-3.1-.9a1.7 1.7 0 0 0-2 .8l-.4.8c-.3.6-1 .9-1.7.9H12c-.7 0-1.4-.3-1.7-.9l-.4-.8a1.7 1.7 0 0 0-2-.8l-3.1.9c-.7.2-1.5-.1-1.9-.7l-1.1-1.7c-.6-.9-.3-2.1.6-2.7Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={!canConnect || status === "connecting"}
              className={classNames(
                "group flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg focus:outline-none focus-visible:ring-2",
                status === "connecting"
                  ? "bg-amber-500 shadow-amber-500/20 focus-visible:ring-amber-500/40"
                  : "bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-500 focus-visible:ring-emerald-600/40",
              )}
              title="Call"
            >
              {status === "connecting" ? (
                <svg viewBox="0 0 24 24" className="h-7 w-7 animate-spin" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6.2 11.7c.8 2.1 2.9 4.2 5 5 .7.3 1.5.1 2-.4l1.1-1.1c.3-.3.7-.4 1.1-.3l2 .7c.7.2 1.1.9.9 1.6l-.4 1.5c-.2.6-.7 1-1.3 1.1-7.1 1-13-4.9-12-12 .1-.6.5-1.1 1.1-1.3l1.5-.4c.7-.2 1.4.2 1.6.9l.7 2c.1.4 0 .8-.3 1.1l-1.1 1.1c-.5.5-.7 1.3-.4 2Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            className={classNames(
              "rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
              micEnabled ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            )}
            disabled={status !== "connected"}
            onClick={() => (micEnabled ? disableMic() : void enableMic())}
            title={micEnabled ? "Mute mic" : "Unmute mic"}
          >
            {micEnabled ? "Mic on" : "Mic off"}
          </button>
        </div>

        <div className="sr-only" aria-live="polite">
          Status {status}. {conversationId ? `Conversation ${conversationId}.` : ""}
          {agentOutputFormat ? `Out ${agentOutputFormat}.` : ""} {userInputFormat ? `In ${userInputFormat}.` : ""}
        </div>
      </div>
    </div>
  );
}
