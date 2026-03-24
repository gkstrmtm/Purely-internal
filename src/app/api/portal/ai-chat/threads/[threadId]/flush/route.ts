import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  // Scheduled-send was removed from AI Chat.
  // Keep this endpoint as a harmless no-op in case anything still calls it.
  void req;
  void ctx;
  return NextResponse.json({ ok: true, processed: 0, note: "AI Chat scheduling is disabled" });
}
