type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessageMultimodal = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type OpenAIAudioTranscriptionResponse = {
  text?: string;
};

type OpenAIAudioTranscriptionVerboseResponse = {
  text?: string;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
};

function readAiFailureHeaders(headers: Headers): Record<string, string | null> {
  const names = [
    "x-request-id",
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens",
    "retry-after",
  ];

  return Object.fromEntries(names.map((name) => [name, headers.get(name)]));
}

function buildAiApiKeyCandidates(primary?: string): string[] {
  return [
    primary,
    process.env.PURA_NEW,
    process.env.AI_API_KEY,
    process.env.PURA_AI_API_KEY,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function buildAiModelCandidates(primary?: string): string[] {
  return [
    primary,
    process.env.PURA_AI_MODEL,
    process.env.AI_MODEL,
    process.env.PURA_AI_MODEL_FAST,
    "gpt-4o-mini",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function shouldRetryWithAnotherAiKey(status: number, bodyText: string): boolean {
  const text = String(bodyText || "").toLowerCase();
  return status === 429 || /insufficient_quota|rate limit|too many requests/.test(text);
}

const aiQuotaCooldownUntilByBaseUrl = new Map<string, number>();

function hasActiveAiQuotaCooldown(baseUrl: string): boolean {
  const until = aiQuotaCooldownUntilByBaseUrl.get(baseUrl) ?? 0;
  if (!until) return false;
  if (until <= Date.now()) {
    aiQuotaCooldownUntilByBaseUrl.delete(baseUrl);
    return false;
  }
  return true;
}

function setAiQuotaCooldown(baseUrl: string, durationMs: number) {
  aiQuotaCooldownUntilByBaseUrl.set(baseUrl, Date.now() + durationMs);
}

function maybeSetAiQuotaCooldown(baseUrl: string, status: number, errorText: string) {
  if (!baseUrl) return;
  if (status === 429 && /insufficient_quota/i.test(String(errorText || ""))) {
    setAiQuotaCooldown(baseUrl, 2 * 60 * 1000);
  }
}

function userExplicitlyRequestsEmojis(context: string): boolean {
  const t = String(context || "").toLowerCase();
  if (!t.trim()) return false;

  // If the user is asking us NOT to use emojis, do not allow them.
  if (/\b(no|without|dont|don't|do not|never)\b[\s\S]{0,40}\b(emojis?|emoji)\b/i.test(t)) return false;

  return /\b(use|add|include|show|give|return|respond with)\b[\s\S]{0,40}\b(emojis?|emoji)\b/i.test(t);
}

function stripEmojis(raw: string): string {
  const s = String(raw || "");
  if (!s) return s;

  // Remove emoji presentation characters + joiners/variation selectors.
  // Note: this is intentionally conservative; it prioritizes a strict "no emojis" policy.
  return s
    // IMPORTANT: Do NOT remove \p{Emoji_Component}. That Unicode property includes ASCII digits (0-9)
    // used in keycap emoji sequences, and stripping it removes numbers from normal text.
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}]/gu, "")
    .replace(/[\u200D\uFE0E\uFE0F]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeAiTextOutput(raw: string, contextForPolicy: string): string {
  if (userExplicitlyRequestsEmojis(contextForPolicy)) return String(raw || "");
  return stripEmojis(raw);
}

export async function generateText({
  system,
  user,
  model,
  temperature,
  baseUrlOverride,
  apiKeyOverride,
  signal,
}: {
  system?: string;
  user: string;
  model?: string;
  temperature?: number;
  baseUrlOverride?: string;
  apiKeyOverride?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const baseUrl = baseUrlOverride ?? process.env.AI_BASE_URL;
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/$/, "");
  const apiKeys = buildAiApiKeyCandidates(apiKeyOverride);
  const modelCandidates = buildAiModelCandidates(model ?? process.env.AI_MODEL ?? "gpt-5.4");

  if (!baseUrl || !apiKeys.length || !modelCandidates.length) {
    throw new Error("AI provider not configured. Set AI_BASE_URL and AI_API_KEY");
  }

  if (hasActiveAiQuotaCooldown(normalizedBaseUrl)) {
    throw new Error("AI request failed: 429 insufficient_quota");
  }

  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  let lastErrorText = "";
  let lastStatus = 0;
  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    const resolvedModel = modelCandidates[modelIndex];
    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex += 1) {
      const apiKey = apiKeys[keyIndex];
      const res = await fetch(`${normalizedBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        signal,
        body: JSON.stringify({
          model: resolvedModel,
          messages,
          temperature: Math.min(2, Math.max(0, typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.6)),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as OpenAIChatResponse;
        const out = data.choices?.[0]?.message?.content ?? "";
        return sanitizeAiTextOutput(out, [system || "", user || ""].filter(Boolean).join("\n\n"));
      }

      const text = await res.text().catch(() => "");
      lastErrorText = text;
      lastStatus = res.status;
      console.error("[ai.generateText] request failed", {
        status: res.status,
        model: resolvedModel,
        modelIndex,
        modelCount: modelCandidates.length,
        baseUrl: normalizedBaseUrl,
        keyIndex,
        keyCount: apiKeys.length,
        headers: readAiFailureHeaders(res.headers),
        body: text.slice(0, 1200),
      });
      if (shouldRetryWithAnotherAiKey(res.status, text)) {
        continue;
      }
      throw new Error(`AI request failed: ${res.status} ${text}`);
    }
  }

  maybeSetAiQuotaCooldown(normalizedBaseUrl, lastStatus, lastErrorText);

  throw new Error(`AI request failed: ${lastStatus} ${lastErrorText}`);
}

export async function generateTextWithImages({
  system,
  user,
  imageUrls,
  model,
  temperature,
  baseUrlOverride,
  apiKeyOverride,
}: {
  system?: string;
  user: string;
  imageUrls: string[];
  model?: string;
  temperature?: number;
  baseUrlOverride?: string;
  apiKeyOverride?: string;
}): Promise<string> {
  const baseUrl = baseUrlOverride ?? process.env.AI_BASE_URL;
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/$/, "");
  const apiKeys = buildAiApiKeyCandidates(apiKeyOverride);
  const resolvedModel = model ?? process.env.AI_VISION_MODEL ?? process.env.AI_MODEL ?? "gpt-5.4";

  if (!baseUrl || !apiKeys.length) {
    throw new Error("AI provider not configured. Set AI_BASE_URL and AI_API_KEY");
  }

  const safeUrls = (Array.isArray(imageUrls) ? imageUrls : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);

  const userParts: ChatContentPart[] = [{ type: "text", text: user }];
  for (const url of safeUrls) userParts.push({ type: "image_url", image_url: { url } });

  const messages: ChatMessageMultimodal[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userParts });

  let lastErrorText = "";
  let lastStatus = 0;
  for (let index = 0; index < apiKeys.length; index += 1) {
    const apiKey = apiKeys[index];
    const res = await fetch(`${normalizedBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        temperature: Math.min(2, Math.max(0, typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.6)),
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as OpenAIChatResponse;
      const out = data.choices?.[0]?.message?.content ?? "";
      return sanitizeAiTextOutput(out, [system || "", user || ""].filter(Boolean).join("\n\n"));
    }

    const text = await res.text().catch(() => "");
    lastErrorText = text;
    lastStatus = res.status;
    console.error("[ai.generateTextWithImages] request failed", {
      status: res.status,
      model: resolvedModel,
      baseUrl: normalizedBaseUrl,
      keyIndex: index,
      keyCount: apiKeys.length,
      headers: readAiFailureHeaders(res.headers),
      body: text.slice(0, 1200),
    });
    if (index < apiKeys.length - 1 && shouldRetryWithAnotherAiKey(res.status, text)) {
      continue;
    }
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }


  maybeSetAiQuotaCooldown(normalizedBaseUrl, lastStatus, lastErrorText);

  throw new Error(`AI request failed: ${lastStatus} ${lastErrorText}`);
}

export async function transcribeAudio({
  bytes,
  filename,
  mimeType,
  model,
  baseUrlOverride,
  apiKeyOverride,
}: {
  bytes: ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  model?: string;
  baseUrlOverride?: string;
  apiKeyOverride?: string;
}): Promise<string> {
  const baseUrl = baseUrlOverride ?? process.env.AI_BASE_URL;
  const apiKey = apiKeyOverride ?? process.env.AI_API_KEY ?? process.env.PURA_NEW;
  const resolvedModel = model ?? process.env.AI_TRANSCRIBE_MODEL ?? "whisper-1";

  if (!baseUrl || !apiKey) {
    throw new Error("AI not configured. Set AI_BASE_URL and AI_API_KEY");
  }

  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer typing issues in TS.
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  const name = (filename ?? "recording.mp3").trim() || "recording.mp3";
  const type = (mimeType ?? "audio/mpeg").trim() || "audio/mpeg";

  const form = new FormData();
  form.set("model", resolvedModel);
  form.set("response_format", "json");
  form.set("file", new Blob([ab], { type }), name);

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`AI transcription failed: ${res.status} ${text}`);

  const trimmed = text.trim();
  if (!trimmed) return "";

  try {
    const json = JSON.parse(trimmed) as OpenAIAudioTranscriptionResponse;
    return typeof json?.text === "string" ? json.text : "";
  } catch {
    // Some providers return plain text.
    return trimmed;
  }
}

export async function transcribeAudioVerbose({
  bytes,
  filename,
  mimeType,
  model,
  baseUrlOverride,
  apiKeyOverride,
}: {
  bytes: ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  model?: string;
  baseUrlOverride?: string;
  apiKeyOverride?: string;
}): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const baseUrl = baseUrlOverride ?? process.env.AI_BASE_URL;
  const apiKey = apiKeyOverride ?? process.env.AI_API_KEY ?? process.env.PURA_NEW;
  const resolvedModel = model ?? process.env.AI_TRANSCRIBE_MODEL ?? "whisper-1";

  if (!baseUrl || !apiKey) {
    throw new Error("AI not configured. Set AI_BASE_URL and AI_API_KEY");
  }

  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);

  const name = (filename ?? "recording.wav").trim() || "recording.wav";
  const type = (mimeType ?? "audio/wav").trim() || "audio/wav";

  const form = new FormData();
  form.set("model", resolvedModel);
  form.set("response_format", "verbose_json");
  form.set("file", new Blob([ab], { type }), name);

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`AI transcription failed: ${res.status} ${text}`);

  const trimmed = text.trim();
  if (!trimmed) return { text: "", segments: [] };

  try {
    const json = JSON.parse(trimmed) as OpenAIAudioTranscriptionVerboseResponse;
    const outText = typeof json?.text === "string" ? json.text : "";
    const segs = Array.isArray(json?.segments)
      ? json.segments
          .map((s) => ({
            start: Number(s?.start ?? NaN),
            end: Number(s?.end ?? NaN),
            text: String(s?.text ?? "").trim(),
          }))
          .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.text)
      : [];

    return { text: outText, segments: segs };
  } catch {
    // Some providers return plain text even when asked for verbose_json.
    return { text: trimmed, segments: [] };
  }
}
