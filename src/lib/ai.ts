type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type OpenAIAudioTranscriptionResponse = {
  text?: string;
};

export async function generateText({
  system,
  user,
  model,
}: {
  system?: string;
  user: string;
  model?: string;
}): Promise<string> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const resolvedModel = model ?? process.env.AI_MODEL ?? "gpt-4o-mini";

  // Dev-friendly fallback so the UI works without configuring an AI provider.
  if (!baseUrl || !apiKey) {
    return [
      "(AI not configured — set AI_API_KEY in .env.local)",
      "",
      "Quick opener:",
      "Hey {{business_name}}, this is {{your_name}} — quick question.",
      "",
      "Value hook:",
      "We help {{niche}} businesses book more qualified appointments without adding admin work.",
      "",
      "Discovery:",
      "1) How are you currently getting leads?",
      "2) What’s your close rate on inbound vs outbound?",
      "3) If you could add 10 appointments next month, could you handle it?",
    ].join("\n");
  }

  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as OpenAIChatResponse;
  return data.choices?.[0]?.message?.content ?? "";
}

export async function transcribeAudio({
  bytes,
  filename,
  mimeType,
  model,
}: {
  bytes: ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  model?: string;
}): Promise<string> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const resolvedModel = model ?? process.env.AI_TRANSCRIBE_MODEL ?? "whisper-1";

  if (!baseUrl || !apiKey) {
    throw new Error("AI not configured — set AI_BASE_URL and AI_API_KEY");
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
