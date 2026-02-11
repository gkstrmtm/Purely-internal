import { type VoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

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
  if (!apiKey) return { ok: false, error: "Missing ElevenLabs API key" };
  if (!agentId) return { ok: false, error: "Missing ElevenLabs agent id" };

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
    return { ok: false, error: `ElevenLabs failed (${res.status}): ${text.slice(0, 400)}`, status: res.status };
  }

  try {
    const json = JSON.parse(text);
    return { ok: true, agent: json };
  } catch {
    return { ok: true, agent: {} };
  }
}
