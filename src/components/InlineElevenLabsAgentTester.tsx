"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TesterMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  createdAt: number;
};

type WsEnvelope = Record<string, any>;

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

function extractEventText(evt: WsEnvelope): { role: TesterMessage["role"]; text: string } | null {
  const type = typeof evt?.type === "string" ? evt.type : "";

  if (type === "agent_response") {
    const text =
      (typeof evt?.agent_response_event?.agent_response === "string" ? evt.agent_response_event.agent_response : "") ||
      (typeof evt?.agent_response === "string" ? evt.agent_response : "");
    return text ? { role: "agent", text } : null;
  }

  if (type === "agent_response_correction") {
    const text =
      (typeof evt?.agent_response_correction_event?.agent_response_correction === "string"
        ? evt.agent_response_correction_event.agent_response_correction
        : "") ||
      (typeof evt?.agent_response_correction === "string" ? evt.agent_response_correction : "");
    return text ? { role: "agent", text: text } : null;
  }

  if (type === "user_transcript") {
    const text =
      (typeof evt?.user_transcription_event?.user_transcript === "string" ? evt.user_transcription_event.user_transcript : "") ||
      (typeof evt?.user_transcript === "string" ? evt.user_transcript : "");
    return text ? { role: "user", text } : null;
  }

  if (type === "client_tool_call") {
    const toolName = typeof evt?.client_tool_call?.tool_name === "string" ? evt.client_tool_call.tool_name : "";
    const toolId = typeof evt?.client_tool_call?.tool_call_id === "string" ? evt.client_tool_call.tool_call_id : "";
    if (!toolName && !toolId) return null;
    return { role: "system", text: `Tool call: ${toolName || "(unknown)"}${toolId ? ` (${toolId})` : ""}` };
  }

  if (type === "interruption") return { role: "system", text: "Interrupted" };

  return null;
}

export function InlineElevenLabsAgentTester(props: {
  agentId: string | null | undefined;
  title?: string;
  description?: string;
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

  const [messages, setMessages] = useState<TesterMessage[]>([]);
  const [value, setValue] = useState("");

  const canConnect = Boolean(agentId);

  const pushMessage = useCallback((m: Omit<TesterMessage, "id" | "createdAt"> & { id?: string; createdAt?: number }) => {
    const id = m.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const createdAt = typeof m.createdAt === "number" ? m.createdAt : Date.now();
    const text = String(m.text || "").trim();
    if (!text) return;

    setMessages((prev) => [...prev, { id, createdAt, role: m.role, text }]);
  }, []);

  const disconnect = useCallback(() => {
    setError(null);
    setConversationId(null);
    setAgentOutputFormat(null);
    setUserInputFormat(null);

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
    pushMessage({ role: "system", text: "Microphone enabled" });
  }, [micEnabled, pushMessage, userInputFormat]);

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
    pushMessage({ role: "system", text: "Microphone disabled" });
  }, [pushMessage]);

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
      pushMessage({ role: "system", text: "Connected" });

      // Kick off the conversation using the server-side agent config.
      ws.send(JSON.stringify({ type: "conversation_initiation_client_data" }));
    };

    ws.onclose = () => {
      // If the current ref isn't this socket, we already reconnected.
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setStatus("disconnected");
      pushMessage({ role: "system", text: "Disconnected" });
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

      const extracted = extractEventText(data);
      if (extracted) pushMessage({ role: extracted.role, text: extracted.text });
    };
  }, [agentId, canConnect, playIncomingAudioChunk, pushMessage, status]);

  const send = useCallback(async () => {
    const text = String(value || "").trim();
    if (!text) return;

    setValue("");

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Not connected. Click Connect first.");
      return;
    }

    pushMessage({ role: "user", text });
    ws.send(JSON.stringify({ type: "user_message", text }));
  }, [pushMessage, value]);

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
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">{props.title || "Inline agent tester"}</div>
            <div className="mt-1 text-xs text-zinc-600">
              {props.description || "Full voice testing inline (no floating widget)."}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={classNames(
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                status === "connected"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : status === "connecting"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-zinc-200 bg-white text-zinc-700",
              )}
            >
              {status}
            </div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
              disabled={!canConnect || status === "connecting"}
              onClick={() => void connect()}
            >
              Connect
            </button>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
              disabled={status !== "connected"}
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </div>
        </div>

        {conversationId ? (
          <div className="mt-3 text-[11px] text-zinc-500">
            Conversation: <span className="font-mono">{conversationId}</span>
          </div>
        ) : null}

        {agentOutputFormat || userInputFormat ? (
          <div className="mt-1 text-[11px] text-zinc-500">
            Audio: <span className="font-mono">{agentOutputFormat || "?"}</span> out ·{" "}
            <span className="font-mono">{userInputFormat || "?"}</span> in
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={classNames(
                "rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60",
                micEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
              )}
              disabled={status !== "connected"}
              onClick={() => (micEnabled ? disableMic() : void enableMic())}
            >
              {micEnabled ? "Disable mic" : "Enable mic"}
            </button>

            <button
              type="button"
              className={classNames(
                "rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60",
                speakerEnabled ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50" : "border-amber-200 bg-amber-50 text-amber-900",
              )}
              disabled={status !== "connected"}
              onClick={() => setSpeakerEnabled((v) => !v)}
            >
              {speakerEnabled ? "Mute speaker" : "Unmute speaker"}
            </button>

            <div className="text-[11px] text-zinc-500">
              Voice works over WebSocket; mic requires permission.
            </div>
          </div>

          <div className="h-[320px] overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
            {messages.length === 0 ? (
              <div className="text-sm text-zinc-500">No messages yet.</div>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={classNames("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={classNames(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        m.role === "user"
                          ? "bg-zinc-900 text-white"
                          : m.role === "agent"
                            ? "bg-zinc-100 text-zinc-900"
                            : "bg-white text-zinc-600 border border-zinc-200",
                      )}
                    >
                      {m.role === "system" ? (
                        <div className="text-[11px] font-semibold uppercase tracking-wide">System</div>
                      ) : null}
                      <div className={m.role === "system" ? "text-xs" : ""}>{m.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,auto]">
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "user_activity" }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={status === "connected" ? "Type a message…" : "Connect to start…"}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              disabled={status !== "connected"}
            />
            <button
              type="button"
              className={classNames(
                "rounded-2xl px-4 py-2 text-sm font-semibold",
                status === "connected" ? "bg-zinc-900 text-white hover:opacity-95" : "bg-zinc-200 text-zinc-700",
              )}
              disabled={status !== "connected"}
              onClick={() => void send()}
            >
              Send
            </button>
          </div>

          <div className="text-[11px] text-zinc-500">
            Inline tester using ElevenLabs Agent WebSocket. No floating launcher, no overlap.
          </div>
        </div>
      </div>
    </div>
  );
}
