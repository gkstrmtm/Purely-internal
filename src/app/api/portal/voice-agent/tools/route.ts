import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type VoiceTool = {
  key: string;
  label: string;
  description: string;
  toolId: string | null;
};

function toolEnv(key: string): string {
  // Prefer a single namespace; allow either STYLE.
  const a = (process.env[`VOICE_AGENT_TOOL_${key}`] ?? "").trim();
  if (a) return a;
  const b = (process.env[`VOICE_AGENT_TOOL_${key}_ID`] ?? "").trim();
  if (b) return b;
  return "";
}

const TOOL_DEFS: Array<Omit<VoiceTool, "toolId"> & { envKey: string }> = [
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
];

export async function GET() {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const tools: VoiceTool[] = TOOL_DEFS.map((d) => {
    const id = toolEnv(d.envKey);
    return {
      key: d.key,
      label: d.label,
      description: d.description,
      toolId: id || null,
    };
  });

  return NextResponse.json({ ok: true, tools });
}
