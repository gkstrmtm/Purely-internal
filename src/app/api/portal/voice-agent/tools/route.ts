import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { listVoiceToolsFromEnv } from "@/lib/voiceAgentTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const tools = listVoiceToolsFromEnv();

  return NextResponse.json({ ok: true, tools });
}
