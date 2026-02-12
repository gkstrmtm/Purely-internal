export type VoiceTool = {
  key: string;
  label: string;
  description: string;
  toolId: string | null;
};

type VoiceToolDef = Omit<VoiceTool, "toolId"> & { envKey: string };

function toolEnv(key: string): string {
  const a = (process.env[`VOICE_AGENT_TOOL_${key}`] ?? "").trim();
  if (a) return a;
  const b = (process.env[`VOICE_AGENT_TOOL_${key}_ID`] ?? "").trim();
  if (b) return b;
  return "";
}

export const VOICE_TOOL_DEFS: VoiceToolDef[] = [
  {
    key: "voicemail_detection",
    envKey: "VOICEMAIL_DETECTION",
    label: "Voicemail detection",
    description: "Helps the agent detect voicemail and adjust messaging or hang up cleanly.",
  },
  {
    key: "language_detection",
    envKey: "LANGUAGE_DETECTION",
    label: "Language detection",
    description: "Helps the agent detect the caller’s language and respond appropriately.",
  },
  {
    key: "end_call",
    envKey: "END_CALL",
    label: "End call",
    description: "Allows the agent to end the call when the goal is complete or the user requests it.",
  },
  {
    key: "transfer_to_human",
    envKey: "TRANSFER_TO_HUMAN",
    label: "Transfer to a human",
    description: "Allows the agent to transfer the call to a human/operator when needed.",
  },

  // Common extra tools people expect (ElevenLabs/voice-agent platform dependent)
  {
    key: "call_transfer",
    envKey: "CALL_TRANSFER",
    label: "Call transfer",
    description: "Lets the agent transfer the call when appropriate.",
  },
  {
    key: "human_skip",
    envKey: "HUMAN_SKIP",
    label: "Skip humans",
    description: "If enabled, the agent can choose to skip when it detects a human it should not engage.",
  },
  {
    key: "transfer_to_agent",
    envKey: "TRANSFER_TO_AGENT",
    label: "Transfer to agent",
    description: "Lets the agent transfer to a specific agent.",
  },
  {
    key: "transfer_to_number",
    envKey: "TRANSFER_TO_NUMBER",
    label: "Transfer to number",
    description: "Lets the agent transfer to a specific phone number.",
  },
  {
    key: "dtmf_tones",
    envKey: "DTMF_TONES",
    label: "Keypad / touch-tone (DTMF)",
    description: "Allows the agent to press keypad/touch-tone digits during IVR menus.",
  },
];

export function listVoiceToolsFromEnv(): VoiceTool[] {
  return VOICE_TOOL_DEFS.map((d) => {
    const id = toolEnv(d.envKey);
    return {
      key: d.key,
      label: d.label,
      description: d.description,
      toolId: id || null,
    };
  });
}

export function resolveToolIdsForKeys(toolKeys: string[]): string[] {
  const keys = Array.isArray(toolKeys) ? toolKeys : [];
  const wanted = new Set(keys.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return [];

  const out: string[] = [];
  for (const def of VOICE_TOOL_DEFS) {
    if (!wanted.has(def.key)) continue;
    const id = toolEnv(def.envKey);
    const toolId = id.trim();
    if (!toolId) continue;
    if (toolId.length > 120) continue;
    if (out.includes(toolId)) continue;
    out.push(toolId);
    if (out.length >= 50) break;
  }
  return out;
}
