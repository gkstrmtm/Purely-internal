import { type VoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

type ElevenLabsPhoneNumber = {
  provider?: "twilio" | "sip_trunk" | string;
  phone_number_id?: string;
  phone_number?: string;
  label?: string;
  assigned_agent?: { agent_id?: string; name?: string } | null;
};

type ElevenLabsConvaiTool = {
  id?: string;
  tool_id?: string;
  name?: string;
  key?: string;
  slug?: string;
  type?: string;
  description?: string;
};

function normalizeToolKey(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.toLowerCase();
}

function toolIdFromTool(t: ElevenLabsConvaiTool): string {
  const a = typeof t.tool_id === "string" ? t.tool_id.trim() : "";
  if (a) return a;
  const b = typeof t.id === "string" ? t.id.trim() : "";
  return b;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function extractTranscriptFromConversationJson(json: unknown): string {
  const rec = asRecord(json);

  const direct =
    (typeof rec.transcript === "string" ? rec.transcript : "") ||
    (typeof rec.transcript_text === "string" ? rec.transcript_text : "") ||
    (typeof rec.transcription === "string" ? rec.transcription : "") ||
    (typeof rec.text === "string" ? rec.text : "");
  if (direct.trim()) return direct.trim();

  const maybe = rec.conversation ? asRecord(rec.conversation) : null;
  if (maybe) {
    const nested =
      (typeof maybe.transcript === "string" ? maybe.transcript : "") ||
      (typeof maybe.transcript_text === "string" ? maybe.transcript_text : "") ||
      (typeof maybe.text === "string" ? maybe.text : "");
    if (nested.trim()) return nested.trim();
  }

  const messages =
    Array.isArray(rec.messages) ? rec.messages :
    Array.isArray(rec.turns) ? rec.turns :
    Array.isArray(rec.events) ? rec.events :
    Array.isArray((rec.conversation && asRecord(rec.conversation).messages)) ? asRecord(rec.conversation).messages :
    null;

  if (Array.isArray(messages)) {
    const lines: string[] = [];
    for (const m of messages) {
      const mr = asRecord(m);
      const role = typeof mr.role === "string" ? mr.role.trim() : typeof mr.speaker === "string" ? mr.speaker.trim() : "";
      const text = typeof mr.text === "string" ? mr.text : typeof mr.message === "string" ? mr.message : typeof mr.content === "string" ? mr.content : "";
      const t = String(text || "").trim();
      if (!t) continue;
      lines.push(role ? `${role}: ${t}` : t);
      if (lines.join("\n").length > 25000) break;
    }
    return lines.join("\n").trim();
  }

  return "";
}

async function fetchConversationFromUrl(apiKey: string, url: string): Promise<any | null> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      accept: "application/json",
    },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchElevenLabsConversationTranscript(opts: {
  apiKey: string;
  conversationId: string;
}): Promise<{ ok: true; transcript: string } | { ok: false; error: string; status?: number }> {
  const apiKey = String(opts.apiKey || "").trim();
  const conversationId = String(opts.conversationId || "").trim();
  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };
  if (!conversationId) return { ok: false, error: "Missing conversation id" };

  const cid = encodeURIComponent(conversationId);
  const urls = [
    `https://api.elevenlabs.io/v1/convai/conversations/${cid}`,
    `https://api.elevenlabs.io/v1/convai/conversation/${cid}`,
    `https://api.elevenlabs.io/v1/convai/conversations/${cid}/transcript`,
    `https://api.elevenlabs.io/v1/convai/conversation/${cid}/transcript`,
  ];

  for (const url of urls) {
    const json = await fetchConversationFromUrl(apiKey, url);
    if (!json) continue;
    const transcript = extractTranscriptFromConversationJson(json);
    if (transcript.trim()) return { ok: true, transcript: transcript.trim().slice(0, 25000) };
  }

  return { ok: false, error: "No transcript available from voice agent platform yet." };
}

async function fetchToolsFromUrl(apiKey: string, url: string): Promise<ElevenLabsConvaiTool[] | null> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      accept: "application/json",
    },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return [];

  try {
    const json = JSON.parse(text) as any;
    if (Array.isArray(json)) return json as ElevenLabsConvaiTool[];
    if (json && typeof json === "object") {
      if (Array.isArray((json as any).tools)) return (json as any).tools as ElevenLabsConvaiTool[];
      if (Array.isArray((json as any).data)) return (json as any).data as ElevenLabsConvaiTool[];
      if (Array.isArray((json as any).items)) return (json as any).items as ElevenLabsConvaiTool[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function listElevenLabsConvaiTools(opts: {
  apiKey: string;
}): Promise<{ ok: true; tools: ElevenLabsConvaiTool[] } | { ok: false; error: string; status?: number }> {
  const apiKey = String(opts.apiKey || "").trim();
  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };

  // Endpoint naming has varied across doc generations; try a couple common ones.
  const urls = [
    "https://api.elevenlabs.io/v1/convai/tools",
    "https://api.elevenlabs.io/v1/convai/tool",
  ];

  for (const url of urls) {
    const tools = await fetchToolsFromUrl(apiKey, url);
    if (tools) return { ok: true, tools };
  }

  return { ok: false, error: "Unable to list voice agent tools. Check API key permissions." };
}

export async function resolveElevenLabsConvaiToolIdsByKeys(opts: {
  apiKey: string;
  toolKeys: string[];
}): Promise<{ ok: true; toolIds: Record<string, string[]> } | { ok: false; error: string }> {
  const apiKey = String(opts.apiKey || "").trim();
  const wanted = Array.isArray(opts.toolKeys) ? opts.toolKeys.map((k) => normalizeToolKey(k)).filter(Boolean) : [];
  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };
  if (!wanted.length) return { ok: true, toolIds: {} };

  const list = await listElevenLabsConvaiTools({ apiKey });
  if (!list.ok) return { ok: false, error: list.error };

  const out: Record<string, string[]> = {};

  for (const w of wanted) out[w] = [];

  for (const t of list.tools || []) {
    const id = toolIdFromTool(t);
    if (!id) continue;

    const candidates = [t.key, t.name, t.slug].map(normalizeToolKey).filter(Boolean);
    for (const w of wanted) {
      if (!candidates.includes(w)) continue;
      if (!out[w].includes(id)) out[w].push(id);
    }
  }

  // Trim to a sane limit.
  for (const k of Object.keys(out)) {
    out[k] = out[k].slice(0, 10);
    if (!out[k].length) delete out[k];
  }

  return { ok: true, toolIds: out };
}

export async function listElevenLabsConvaiPhoneNumbers(opts: {
  apiKey: string;
}): Promise<{ ok: true; phoneNumbers: ElevenLabsPhoneNumber[] } | { ok: false; error: string; status?: number }> {
  const apiKey = String(opts.apiKey || "").trim();
  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };

  const url = `https://api.elevenlabs.io/v1/convai/phone-numbers`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      error: `Voice agent request failed (${res.status}): ${text.slice(0, 400)}`,
      status: res.status,
    };
  }

  try {
    const json = JSON.parse(text);
    const phoneNumbers = Array.isArray(json) ? (json as ElevenLabsPhoneNumber[]) : [];
    return { ok: true, phoneNumbers };
  } catch {
    return { ok: true, phoneNumbers: [] };
  }
}

export async function resolveElevenLabsAgentPhoneNumberId(opts: {
  apiKey: string;
  agentId: string;
}): Promise<{ ok: true; phoneNumberId: string } | { ok: false; error: string; status?: number }> {
  const apiKey = String(opts.apiKey || "").trim();
  const agentId = String(opts.agentId || "").trim();
  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };
  if (!agentId) return { ok: false, error: "Missing voice agent ID" };

  const list = await listElevenLabsConvaiPhoneNumbers({ apiKey });
  if (!list.ok) return list;

  const phoneNumbers = list.phoneNumbers
    .map((p) => ({
      provider: typeof p?.provider === "string" ? p.provider : "",
      phone_number_id: typeof p?.phone_number_id === "string" ? p.phone_number_id : "",
      phone_number: typeof p?.phone_number === "string" ? p.phone_number : "",
      label: typeof p?.label === "string" ? p.label : "",
      assigned_agent:
        p?.assigned_agent && typeof p.assigned_agent === "object" && !Array.isArray(p.assigned_agent)
          ? p.assigned_agent
          : null,
    }))
    .filter((p) => Boolean(p.phone_number_id));

  const assigned = phoneNumbers.find((p) => String(p.assigned_agent?.agent_id || "").trim() === agentId);
  if (assigned?.phone_number_id) return { ok: true, phoneNumberId: assigned.phone_number_id };

  if (phoneNumbers.length === 1) {
    return { ok: true, phoneNumberId: phoneNumbers[0].phone_number_id };
  }

  const twilioNums = phoneNumbers.filter((p) => p.provider === "twilio");
  if (twilioNums.length === 1) {
    return { ok: true, phoneNumberId: twilioNums[0].phone_number_id };
  }

  return {
    ok: false,
    error:
      "Unable to choose an agent phone number. Assign a phone number to this agent in your voice agent platform, or ensure only one phone number exists.",
  };
}

export async function placeElevenLabsTwilioOutboundCall(opts: {
  apiKey: string;
  agentId: string;
  agentPhoneNumberId: string;
  toNumberE164: string;
  conversationInitiationClientData?: {
    user_id?: string | null;
    dynamic_variables?: Record<string, string | number | boolean | null>;
    conversation_config_override?: any;
    custom_llm_extra_body?: Record<string, any>;
    source_info?: any;
  };
}): Promise<
  | { ok: true; conversationId?: string | null; callSid?: string | null; message?: string }
  | { ok: false; error: string; status?: number }
> {
  const apiKey = String(opts.apiKey || "").trim();
  const agentId = String(opts.agentId || "").trim();
  const agentPhoneNumberId = String(opts.agentPhoneNumberId || "").trim();
  const toNumber = String(opts.toNumberE164 || "").trim();

  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };
  if (!agentId) return { ok: false, error: "Missing voice agent ID" };
  if (!agentPhoneNumberId) return { ok: false, error: "Missing voice agent phone number ID" };
  if (!toNumber) return { ok: false, error: "Missing destination phone number" };

  const body: any = {
    agent_id: agentId,
    agent_phone_number_id: agentPhoneNumberId,
    to_number: toNumber,
  };

  if (opts.conversationInitiationClientData && typeof opts.conversationInitiationClientData === "object") {
    body.conversation_initiation_client_data = opts.conversationInitiationClientData;
  }

  const url = `https://api.elevenlabs.io/v1/convai/twilio/outbound-call`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      error: `Voice agent request failed (${res.status}): ${text.slice(0, 400)}`,
      status: res.status,
    };
  }

  try {
    const json = JSON.parse(text) as any;
    return {
      ok: true,
      conversationId: typeof json?.conversation_id === "string" ? json.conversation_id : null,
      callSid: typeof json?.callSid === "string" ? json.callSid : null,
      message: typeof json?.message === "string" ? json.message : undefined,
    };
  } catch {
    return { ok: true };
  }
}

export async function registerElevenLabsTwilioCall(opts: {
  apiKey: string;
  agentId: string;
  fromNumberE164: string;
  toNumberE164: string;
  direction?: "inbound" | "outbound";
  conversationInitiationClientData?: {
    user_id?: string | null;
    dynamic_variables?: Record<string, string | number | boolean | null>;
    conversation_config_override?: any;
    custom_llm_extra_body?: Record<string, any>;
    source_info?: any;
  };
}): Promise<{ ok: true; twiml: string } | { ok: false; error: string; status?: number }> {
  const apiKey = String(opts.apiKey || "").trim();
  const agentId = String(opts.agentId || "").trim();
  const fromNumber = String(opts.fromNumberE164 || "").trim();
  const toNumber = String(opts.toNumberE164 || "").trim();

  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };
  if (!agentId) return { ok: false, error: "Missing voice agent ID" };
  if (!fromNumber) return { ok: false, error: "Missing from number" };
  if (!toNumber) return { ok: false, error: "Missing to number" };

  const body: any = {
    agent_id: agentId,
    from_number: fromNumber,
    to_number: toNumber,
    direction: opts.direction || "inbound",
  };

  if (opts.conversationInitiationClientData && typeof opts.conversationInitiationClientData === "object") {
    body.conversation_initiation_client_data = opts.conversationInitiationClientData;
  }

  const url = `https://api.elevenlabs.io/v1/convai/twilio/register-call`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
      accept: "text/xml, application/xml, application/json, text/plain",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      error: `Voice agent request failed (${res.status}): ${text.slice(0, 400)}`,
      status: res.status,
    };
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<Response") || trimmed.startsWith("<")) {
    return { ok: true, twiml: trimmed };
  }

  try {
    const json = JSON.parse(text) as any;
    const twiml = typeof json?.twiml === "string" ? json.twiml : typeof json?.TwiML === "string" ? json.TwiML : "";
    if (twiml.trim()) return { ok: true, twiml: twiml.trim() };
    return { ok: false, error: "Voice agent register-call returned an unexpected response." };
  } catch {
    return { ok: false, error: "Voice agent register-call returned an unexpected response." };
  }
}

export function buildElevenLabsAgentPrompt(config: VoiceAgentConfig): string {
  const parts: string[] = [];

  if (config.goal.trim()) {
    parts.push(`Goal:\n${config.goal.trim()}`);
  }

  if (config.personality.trim()) {
    parts.push(`Personality:\n${config.personality.trim()}`);
  }

  if (config.tone.trim()) {
    parts.push(`Tone:\n${config.tone.trim()}`);
  }

  if (config.environment.trim()) {
    parts.push(`Environment:\n${config.environment.trim()}`);
  }

  if (config.guardRails.trim()) {
    parts.push(`Guard rails:\n${config.guardRails.trim()}`);
  }

  // If the user hasn't provided anything, don't clobber the agent prompt.
  return parts.join("\n\n").trim().slice(0, 6000);
}

export async function patchElevenLabsAgent(opts: {
  apiKey: string;
  agentId: string;
  firstMessage?: string;
  prompt?: string;
  toolIds?: string[];
}): Promise<{ ok: true; agent: any } | { ok: false; error: string; status?: number }> {
  const apiKey = String(opts.apiKey || "").trim();
  const agentId = String(opts.agentId || "").trim();
  if (!apiKey) return { ok: false, error: "Missing voice agent API key" };
  if (!agentId) return { ok: false, error: "Missing voice agent ID" };

  const body: any = {};

  const firstMessage = typeof opts.firstMessage === "string" ? opts.firstMessage.trim().slice(0, 360) : "";
  const prompt = typeof opts.prompt === "string" ? opts.prompt.trim().slice(0, 6000) : "";
  const toolIds = Array.isArray(opts.toolIds)
    ? opts.toolIds
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
        .slice(0, 50)
    : [];

  const conversationConfig: any = {};
  const agentCfg: any = {};

  if (firstMessage) agentCfg.first_message = firstMessage;
  if (prompt || toolIds.length) {
    agentCfg.prompt = {
      ...(prompt ? { prompt } : {}),
      ...(toolIds.length ? { tool_ids: toolIds } : {}),
    };
  }

  if (Object.keys(agentCfg).length) {
    conversationConfig.agent = agentCfg;
  }

  if (Object.keys(conversationConfig).length) {
    body.conversation_config = conversationConfig;
  }

  if (!Object.keys(body).length) {
    return { ok: false, error: "Nothing to update" };
  }

  const url = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      error: `Voice agent request failed (${res.status}): ${text.slice(0, 400)}`,
      status: res.status,
    };
  }

  try {
    const json = JSON.parse(text);
    return { ok: true, agent: json };
  } catch {
    return { ok: true, agent: {} };
  }
}
