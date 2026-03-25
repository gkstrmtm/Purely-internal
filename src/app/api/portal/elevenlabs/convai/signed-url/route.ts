import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getElevenLabsConvaiConversationSignedUrl } from "@/lib/portalElevenLabsConvaiAuth.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  agentId: z.string().trim().min(1).max(120),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("profile");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const agentId = parsed.data.agentId;

  const result = await getElevenLabsConvaiConversationSignedUrl({ ownerId, agentId });
  return NextResponse.json(result.json, { status: result.status });
}
