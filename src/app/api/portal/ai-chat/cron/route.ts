import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  // Scheduled-send was removed from AI Chat.
  // Keep this endpoint as a harmless no-op in case anything still calls it.
  void req;
  return NextResponse.json({ ok: true, processed: 0, note: "Pura scheduling is disabled" });
}
