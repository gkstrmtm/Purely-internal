export type VoiceAgentConfig = {
  firstMessage: string;
  goal: string;
  personality: string;
  environment: string;
  tone: string;
  guardRails: string;
  toolKeys: string[];
  toolIds: string[];
};

export const DEFAULT_VOICE_AGENT_CONFIG: VoiceAgentConfig = {
  firstMessage: "",
  goal: "",
  personality: "",
  environment: "",
  tone: "",
  guardRails: "",
  toolKeys: [],
  toolIds: [],
};

const MAX_TEXT_LEN = 6000;
const MAX_FIRST_MESSAGE_LEN = 360;

function normalizeString(raw: unknown, maxLen: number): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s.slice(0, maxLen) : "";
}

export function normalizeToolIdList(raw: unknown): string[] {
  const xs = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const x of xs) {
    const id = typeof x === "string" ? x.trim() : "";
    if (!id) continue;
    if (id.length > 120) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= 50) break;
  }
  return out;
}

export function normalizeToolKeyList(raw: unknown): string[] {
  const xs = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const x of xs) {
    const key = typeof x === "string" ? x.trim() : "";
    if (!key) continue;
    if (key.length > 80) continue;
    if (!/^[a-z0-9_]+$/i.test(key)) continue;
    const normalized = key.toLowerCase();
    if (out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= 50) break;
  }
  return out;
}

export function parseVoiceAgentConfig(raw: unknown): VoiceAgentConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_VOICE_AGENT_CONFIG };
  const rec = raw as Record<string, unknown>;

  return {
    firstMessage: normalizeString(rec.firstMessage, MAX_FIRST_MESSAGE_LEN),
    goal: normalizeString(rec.goal, MAX_TEXT_LEN),
    personality: normalizeString(rec.personality, MAX_TEXT_LEN),
    environment: normalizeString(rec.environment, MAX_TEXT_LEN),
    tone: normalizeString(rec.tone, MAX_TEXT_LEN),
    guardRails: normalizeString(rec.guardRails, MAX_TEXT_LEN),
    toolKeys: normalizeToolKeyList(rec.toolKeys),
    toolIds: normalizeToolIdList(rec.toolIds),
  };
}
