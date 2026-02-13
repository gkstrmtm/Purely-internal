import { type VoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

type ElevenLabsPhoneNumber = {
  provider?: "twilio" | "sip_trunk" | string;
  phone_number_id?: string;
  phone_number?: string;
  label?: string;
  assigned_agent?: { agent_id?: string; name?: string } | null;
};

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
  if (prompt) {
    agentCfg.prompt = {
      prompt,
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
